/**
 * Verify an id_token issued by Sapt against its JWKS. Returns the decoded
 * payload (specifically the `sub` claim and standard timing fields) on success,
 * null on failure. JWKS is fetched once per worker boot and cached in memory.
 *
 * Trust model: signature + iss + aud + exp. Audience is the OAuth client_id.
 * Skew tolerance is 60 seconds. Sapt currently signs with EdDSA (Ed25519);
 * RS256 and ES256 are accepted for forward-compat.
 */

export interface IdTokenPayload {
  sub: string
  iss: string
  aud: string | string[]
  exp: number
  iat?: number
  email?: string
  name?: string
}

const SKEW_SECONDS = 60
let jwksCache: { url: string; keys: JsonWebKey[]; fetchedAt: number } | null = null
const JWKS_TTL_MS = 5 * 60 * 1000

interface JwkEntry extends JsonWebKey {
  kid?: string
  alg?: string
  use?: string
}

interface JwksResponse {
  keys: JwkEntry[]
}

export async function verifyIdToken(
  token: string,
  options: { jwksUrl: string; expectedIssuer: string; expectedAudience: string }
): Promise<IdTokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]

  const header = decodeJson<{ alg?: string; kid?: string }>(headerB64)
  const payload = decodeJson<IdTokenPayload>(payloadB64)
  if (!header || !payload) return null
  if (header.alg !== 'RS256' && header.alg !== 'ES256' && header.alg !== 'EdDSA') return null

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
  if (typeof payload.iss !== 'string' || payload.iss !== options.expectedIssuer) return null
  if (typeof payload.exp !== 'number') return null
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp + SKEW_SECONDS < now) return null

  const aud = payload.aud
  const audMatch = Array.isArray(aud)
    ? aud.includes(options.expectedAudience)
    : aud === options.expectedAudience
  if (!audMatch) return null

  const keys = await loadJwks(options.jwksUrl)
  const jwk = keys.find((k) => (header.kid ? (k as JwkEntry).kid === header.kid : true))
  if (!jwk) return null

  // Web Crypto's importKey signatures vary per algorithm. RS256 wants
  // RsaHashedImportParams, ES256 wants EcKeyImportParams, EdDSA over Ed25519
  // takes a plain { name: 'Ed25519' }. The corresponding verify() algorithm
  // names also differ.
  const algorithm: RsaHashedImportParams | EcKeyImportParams | { name: 'Ed25519' } =
    header.alg === 'RS256'
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : header.alg === 'ES256'
        ? { name: 'ECDSA', namedCurve: 'P-256' }
        : { name: 'Ed25519' }

  const cryptoKey = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify'])
  const sig = b64urlToBytes(sigB64)
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

  const verifyAlg: AlgorithmIdentifier | EcdsaParams =
    header.alg === 'RS256'
      ? 'RSASSA-PKCS1-v1_5'
      : header.alg === 'ES256'
        ? { name: 'ECDSA', hash: 'SHA-256' }
        : 'Ed25519'

  const ok = await crypto.subtle.verify(verifyAlg, cryptoKey, sig, signed)
  return ok ? payload : null
}

async function loadJwks(url: string): Promise<JsonWebKey[]> {
  if (jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const body = (await res.json()) as JwksResponse
  const keys = Array.isArray(body.keys) ? body.keys : []
  jwksCache = { url, keys, fetchedAt: Date.now() }
  return keys
}

function decodeJson<T>(b64: string): T | null {
  try {
    const json = new TextDecoder().decode(b64urlToBytes(b64))
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const raw = atob(padded)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
