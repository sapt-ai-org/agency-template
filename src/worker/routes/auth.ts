import { Hono, type Context } from 'hono'
import { saptFromEnv } from '../sapt'
import { verifyIdToken } from '../jwt'
import { clearSession, setSession } from '../session'
import { getOrProvisionOAuthClient } from '../oauth-provisioning'
import { SaptApiError } from '@/lib/sapt'
import type { AppBindings, WorkerEnv } from '../env'

const STATE_COOKIE = 'oauth_state'
const STATE_TTL_SECONDS = 600
const VERIFIER_KV_PREFIX = 'oauth-verifier:'

export const authRoutes = new Hono<AppBindings>()

authRoutes.get('/auth/start', async (c) => {
  let oauthClient
  try {
    oauthClient = await getOrProvisionOAuthClient(c.env, c.req.url)
  } catch (err) {
    console.error('[auth/start] OAuth client provisioning failed:', err)
    const detail =
      err instanceof SaptApiError ? err.message : err instanceof Error ? err.message : String(err)
    return renderError(c, `Could not set up the Sapt OAuth client for this deployment. ${detail}`, 502)
  }

  const state = randomToken()
  const verifier = randomVerifier()
  const challenge = await sha256base64url(verifier)

  // The verifier is stored server-side keyed by state and read back on
  // callback. Keeps the cookie tiny and ensures the verifier never crosses
  // origins. KV's expirationTtl auto-cleans abandoned attempts.
  await c.env.LINKS.put(VERIFIER_KV_PREFIX + state, verifier, {
    expirationTtl: STATE_TTL_SECONDS,
  })

  c.header(
    'Set-Cookie',
    `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL_SECONDS}`
  )

  const url = new URL(`${c.env.SAPT_ENDPOINT}/api/auth/oauth2/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', oauthClient.clientId)
  url.searchParams.set('redirect_uri', new URL('/auth/callback', c.req.url).toString())
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'openid profile email')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return c.redirect(url.toString())
})

authRoutes.get('/auth/callback', async (c) => {
  const expectedState = parseCookie(c.req.header('Cookie'), STATE_COOKIE)
  const state = c.req.query('state')
  const code = c.req.query('code')

  if (!state || !expectedState || state !== expectedState) {
    return renderError(c, 'Invalid sign-in attempt. Please try again.', 400)
  }
  if (!code) {
    return renderError(c, 'Sapt did not return an authorization code.', 400)
  }

  const verifier = await consumeVerifier(c.env, state)
  if (!verifier) {
    return renderError(c, 'Sign-in attempt expired or was reused. Please try again.', 400)
  }

  let oauthClient
  try {
    oauthClient = await getOrProvisionOAuthClient(c.env, c.req.url)
  } catch (err) {
    console.error('[auth/callback] OAuth client lookup failed:', err)
    return renderError(c, 'Could not resolve the Sapt OAuth client for this deployment.', 502)
  }

  const tokenRes = await fetch(`${c.env.SAPT_ENDPOINT}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/auth/callback', c.req.url).toString(),
      client_id: oauthClient.clientId,
      code_verifier: verifier,
    }),
  })

  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '')
    return renderError(c, `Sapt token exchange failed: ${tokenRes.status} ${detail}`, 502)
  }

  const tokenBody = (await tokenRes.json()) as { id_token?: string; access_token?: string }
  if (!tokenBody.id_token) return renderError(c, 'Sapt did not return an id_token.', 502)

  const payload = await verifyIdToken(tokenBody.id_token, {
    jwksUrl: `${c.env.SAPT_ENDPOINT}/api/auth/jwks`,
    expectedIssuer: c.env.SAPT_ENDPOINT,
    expectedAudience: oauthClient.clientId,
  })
  if (!payload) return renderError(c, 'The id_token from Sapt failed verification.', 502)

  const sapt = saptFromEnv(c.env)
  let me
  try {
    me = await sapt.getAuthMe()
  } catch (err) {
    console.error('[auth/callback] getAuthMe failed:', err)
    const detail = err instanceof Error ? err.message : String(err)
    return renderError(
      c,
      `Could not look up the API key holder. Check SAPT_API_KEY. (${detail})`,
      502
    )
  }

  if (me.actorType !== 'user') {
    return renderError(
      c,
      'This deployment requires a user-level API key. Service-account keys are not supported.',
      403
    )
  }

  if (me.actorId !== payload.sub) {
    return renderError(
      c,
      'The signed-in Sapt identity does not match the API key holder for this deployment.',
      403
    )
  }

  await setSession(c, payload.sub)
  c.res.headers.append(
    'Set-Cookie',
    `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  )
  return c.redirect('/admin')
})

authRoutes.post('/auth/logout', (c) => {
  clearSession(c)
  return c.redirect('/')
})

async function consumeVerifier(env: WorkerEnv, state: string): Promise<string | null> {
  const key = VERIFIER_KV_PREFIX + state
  const verifier = await env.LINKS.get(key)
  if (!verifier) return null
  await env.LINKS.delete(key)
  return verifier
}

function renderError(c: Context<AppBindings>, message: string, status: number) {
  return c.html(
    `<!doctype html><html><head><title>Sign-in error</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#0a0a0a}h1{font-size:20px}p{color:#555;line-height:1.5}a{color:#0a0a0a}</style></head><body><h1>Sign-in failed</h1><p>${escapeHtml(message)}</p><p><a href="/">Return home</a></p></body></html>`,
    status as 400 | 401 | 403 | 502
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// PKCE code_verifier: RFC 7636 says 43–128 chars from the unreserved set
// (A–Z, a–z, 0–9, '-', '.', '_', '~'). Base64url of 32 random bytes lands at
// 43 characters and uses an allowed subset of the unreserved set.
function randomVerifier(): string {
  const buffer = new ArrayBuffer(32)
  const bytes = new Uint8Array(buffer)
  crypto.getRandomValues(bytes)
  return b64urlEncode(bytes)
}

async function sha256base64url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return b64urlEncode(new Uint8Array(digest))
}

function b64urlEncode(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
