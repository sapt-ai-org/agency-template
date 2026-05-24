import type { Context } from 'hono'
import { getSessionSecret } from '@/lib/kv'
import type { WorkerEnv } from './env'

const COOKIE_NAME = 'session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface SessionPayload {
  sub: string
  iat: number
}

export async function setSession(c: Context<{ Bindings: WorkerEnv }>, sub: string): Promise<void> {
  const secret = await getSessionSecret(c.env.LINKS)
  const payload: SessionPayload = { sub, iat: Date.now() }
  const token = await sign(payload, secret)
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  )
}

export function clearSession(c: Context<{ Bindings: WorkerEnv }>): void {
  c.header('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

export async function readSession(
  c: Context<{ Bindings: WorkerEnv }>
): Promise<SessionPayload | null> {
  const cookie = c.req.header('Cookie')
  if (!cookie) return null
  const token = parseCookie(cookie, COOKIE_NAME)
  if (!token) return null
  const secret = await getSessionSecret(c.env.LINKS)
  const payload = await verify(token, secret)
  if (!payload) return null
  if (Date.now() - payload.iat > SESSION_TTL_MS) return null
  return payload
}

export async function requireSession(
  c: Context<{ Bindings: WorkerEnv }>
): Promise<SessionPayload | Response> {
  const session = await readSession(c)
  if (!session) return c.json({ error: { code: 'unauthorized', message: 'Sign in required' } }, 401)
  return session
}

function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

async function sign(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const mac = await hmac(secret, body)
  return `${body}.${mac}`
}

async function verify(token: string, secret: string): Promise<SessionPayload | null> {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null
  const expected = await hmac(secret, body)
  if (!timingSafeEqual(mac, expected)) return null
  try {
    const json = new TextDecoder().decode(b64urlDecode(body))
    const parsed = JSON.parse(json) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SessionPayload).sub === 'string' &&
      typeof (parsed as SessionPayload).iat === 'number'
    ) {
      return parsed as SessionPayload
    }
    return null
  } catch {
    return null
  }
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return b64urlEncode(new Uint8Array(sig))
}

function b64urlEncode(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
