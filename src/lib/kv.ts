import type { AgencyConfig } from './config'
import { DEFAULT_AGENCY_CONFIG } from './config'
import type { LinkRecord, ProgressRecord } from './types'

const LINK_PREFIX = 'link:'
const PROGRESS_PREFIX = 'progress:'
const LINK_INDEX_KEY = 'link-index'
const SESSION_SECRET_KEY = 'session-secret'
const OAUTH_CLIENT_KEY = 'oauth-client'
const AGENCY_CONFIG_KEY = 'agency-config'

export interface OAuthClientRecord {
  clientId: string
  projectId: string
  redirectURLs: string[]
}

type KV = KVNamespace

export async function getLink(kv: KV, linkId: string): Promise<LinkRecord | null> {
  return kv.get<LinkRecord>(LINK_PREFIX + linkId, 'json')
}

export async function putLink(kv: KV, record: LinkRecord): Promise<void> {
  await kv.put(LINK_PREFIX + record.id, JSON.stringify(record))
  await addToIndex(kv, record.id)
}

export async function deleteLink(kv: KV, linkId: string): Promise<void> {
  await Promise.all([
    kv.delete(LINK_PREFIX + linkId),
    kv.delete(PROGRESS_PREFIX + linkId),
    removeFromIndex(kv, linkId),
  ])
}

export async function listLinks(kv: KV): Promise<LinkRecord[]> {
  const index = (await kv.get<string[]>(LINK_INDEX_KEY, 'json')) ?? []
  if (index.length === 0) return []
  const rows = await Promise.all(index.map((id) => getLink(kv, id)))
  return rows.filter((r): r is LinkRecord => r !== null)
}

export async function getProgress(kv: KV, linkId: string): Promise<ProgressRecord | null> {
  return kv.get<ProgressRecord>(PROGRESS_PREFIX + linkId, 'json')
}

export async function putProgress(kv: KV, record: ProgressRecord): Promise<void> {
  await kv.put(PROGRESS_PREFIX + record.linkId, JSON.stringify(record))
}

export async function getOAuthClientRecord(kv: KV): Promise<OAuthClientRecord | null> {
  return kv.get<OAuthClientRecord>(OAUTH_CLIENT_KEY, 'json')
}

export async function putOAuthClientRecord(kv: KV, record: OAuthClientRecord): Promise<void> {
  await kv.put(OAUTH_CLIENT_KEY, JSON.stringify(record))
}

export async function getAgencyConfig(kv: KV): Promise<AgencyConfig> {
  const stored = await kv.get<AgencyConfig>(AGENCY_CONFIG_KEY, 'json')
  return stored ?? DEFAULT_AGENCY_CONFIG
}

export async function putAgencyConfig(kv: KV, config: AgencyConfig): Promise<void> {
  await kv.put(AGENCY_CONFIG_KEY, JSON.stringify(config))
}

export async function deleteAgencyConfig(kv: KV): Promise<void> {
  await kv.delete(AGENCY_CONFIG_KEY)
}

/**
 * Get (or create) the worker-local secret used to sign admin session cookies.
 * Generated on first call and persisted; rotate by deleting the KV key.
 */
export async function getSessionSecret(kv: KV): Promise<string> {
  const existing = await kv.get(SESSION_SECRET_KEY)
  if (existing) return existing
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const secret = bytesToHex(bytes)
  await kv.put(SESSION_SECRET_KEY, secret)
  return secret
}

async function addToIndex(kv: KV, linkId: string): Promise<void> {
  const current = (await kv.get<string[]>(LINK_INDEX_KEY, 'json')) ?? []
  if (current.includes(linkId)) return
  await kv.put(LINK_INDEX_KEY, JSON.stringify([...current, linkId]))
}

async function removeFromIndex(kv: KV, linkId: string): Promise<void> {
  const current = (await kv.get<string[]>(LINK_INDEX_KEY, 'json')) ?? []
  const next = current.filter((id) => id !== linkId)
  if (next.length === current.length) return
  await kv.put(LINK_INDEX_KEY, JSON.stringify(next))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
