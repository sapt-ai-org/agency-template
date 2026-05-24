import { Hono, type Context } from 'hono'
import { saptFromEnv } from '../sapt'
import { verifyIdToken } from '../jwt'
import { clearSession, setSession } from '../session'
import type { AppBindings } from '../env'

const STATE_COOKIE = 'oauth_state'
const STATE_TTL_SECONDS = 600

export const authRoutes = new Hono<AppBindings>()

authRoutes.get('/auth/start', (c) => {
  const state = randomToken()
  c.header(
    'Set-Cookie',
    `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_TTL_SECONDS}`
  )
  const url = new URL(`${c.env.SAPT_ENDPOINT}/api/auth/oauth2/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', c.env.SAPT_OAUTH_CLIENT_ID)
  url.searchParams.set('redirect_uri', new URL('/auth/callback', c.req.url).toString())
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'openid profile email')
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

  const tokenRes = await fetch(`${c.env.SAPT_ENDPOINT}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/auth/callback', c.req.url).toString(),
      client_id: c.env.SAPT_OAUTH_CLIENT_ID,
      client_secret: c.env.SAPT_OAUTH_CLIENT_SECRET,
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
    expectedAudience: c.env.SAPT_OAUTH_CLIENT_ID,
  })
  if (!payload) return renderError(c, 'The id_token from Sapt failed verification.', 502)

  const sapt = saptFromEnv(c.env)
  const me = await sapt.getAuthMe().catch(() => null)
  if (!me) return renderError(c, 'Could not look up the API key holder. Check SAPT_API_KEY.', 502)

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
