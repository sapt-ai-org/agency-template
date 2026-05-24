/**
 * Minimal typed client for the Sapt public REST API.
 *
 * Hand-written; replace with a generated SDK once one exists. Methods map 1:1 to
 * endpoints — no retries, pagination, or caching. Verified against the live
 * routers in sapt-platform as of v0.1.0; if Sapt's response shapes change,
 * update this file.
 */

export interface AuthMe {
  actorId: string
  actorType: string
  actorName: string
  apiKey?: { id: string; prefix: string }
}

export interface SaptProject {
  id: string
  name: string
  slug: string
  plan: string | null
  urls: { name: string; url: string }[] | null
  createdAt: string
}

export interface SaptProjectRole {
  id: string
  projectId: string
  name: string
  description: string | null
  permissions: string[]
}

export interface MemoryEntry {
  id: string
  projectId: string
  slug: string
  title: string
  description: string
  content: string
}

export interface ConnectSession {
  connectUrl: string
  token: string
  expiresAt: string
}

export type ConnectSessionStatus = 'pending' | 'completed' | 'failed' | 'expired'

export interface ConnectSessionView {
  token: string
  providerId: string
  status: ConnectSessionStatus
  expiresAt: string
  completedAt: string | null
  error: string | null
}

export interface CreateInvitationResult {
  invitationId: string | null
  email: string
  action: 'invited' | 'skipped'
  reason?: string
  expiresAt: string | null
}

export interface OAuthClient {
  id: string
  clientId: string
  name: string
  type: string
  redirectURLs: string[]
  disabled: boolean
  projectId: string | null
}

export interface CreateOAuthClientResult {
  clientId: string
  clientSecret: string | null
  client: OAuthClient
}

export class SaptApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'SaptApiError'
  }
}

export interface SaptClientOptions {
  apiKey: string
  endpoint?: string
  fetchImpl?: typeof fetch
}

export interface SaptClient {
  getAuthMe(): Promise<AuthMe>
  listProjects(): Promise<SaptProject[]>
  updateProject(projectId: string, input: UpdateProjectInput): Promise<SaptProject>
  listProjectRoles(projectId: string): Promise<SaptProjectRole[]>
  createMemoryEntry(projectId: string, input: CreateMemoryEntryInput): Promise<MemoryEntry>
  createConnectSession(
    projectId: string,
    input: { providerId: string; clientInvite?: boolean }
  ): Promise<ConnectSession>
  getConnectSession(projectId: string, token: string): Promise<ConnectSessionView>
  createInvitation(
    projectId: string,
    input: { email: string; projectRoleId: string }
  ): Promise<CreateInvitationResult>
  listOAuthClients(projectId: string): Promise<OAuthClient[]>
  createOAuthClient(
    projectId: string,
    input: {
      name: string
      redirectURLs: string[]
      clientType?: 'web' | 'public'
    }
  ): Promise<CreateOAuthClientResult>
  updateOAuthClient(
    projectId: string,
    clientId: string,
    input: { redirectURLs?: string[]; name?: string; disabled?: boolean }
  ): Promise<OAuthClient>
  checkProjectPermission(projectId: string, permission: string): Promise<boolean>
}

export interface UpdateProjectInput {
  name?: string
  urls?: { name: string; url: string }[]
}

export interface CreateMemoryEntryInput {
  slug: string
  title: string
  description: string
  content: string
}

const TEMPLATE_VERSION = '0.1.0'

export function createSaptClient(opts: SaptClientOptions): SaptClient {
  const endpoint = (opts.endpoint ?? 'https://api.sapt.ai').replace(/\/$/, '')
  const fetchImpl = opts.fetchImpl ?? fetch

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${endpoint}${path}`
    const res = await fetchImpl(url, {
      method,
      headers: {
        // Sapt's API key middleware reads the `ApiKey` scheme. `Bearer` is
        // reserved for session and OAuth tokens.
        Authorization: `ApiKey ${opts.apiKey}`,
        // Identifies this client in Sapt's request logs. Lets us filter Axiom
        // by `reqUserAgent startswith "agency-onboarding-template"`.
        'User-Agent': `agency-onboarding-template/${TEMPLATE_VERSION}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    const text = await res.text()
    const parsed: unknown = text ? safeJsonParse(text) : null

    if (!res.ok) {
      const error = isErrorEnvelope(parsed) ? parsed.error : null
      throw new SaptApiError(
        res.status,
        error?.code ?? `http_${res.status}`,
        error?.message ?? res.statusText ?? 'Request failed',
        error?.details
      )
    }

    return parsed as T
  }

  return {
    async getAuthMe() {
      return request<AuthMe>('GET', '/auth/me')
    },
    async listProjects() {
      const res = await request<{ projects: SaptProject[] }>('GET', '/projects')
      return res.projects
    },
    async updateProject(projectId, input) {
      const res = await request<{ project: SaptProject }>(
        'PATCH',
        `/projects/${encodeURIComponent(projectId)}`,
        input
      )
      return res.project
    },
    async listProjectRoles(projectId) {
      const res = await request<{ success: boolean; data: SaptProjectRole[] }>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/roles`
      )
      return res.data
    },
    async createMemoryEntry(projectId, input) {
      const res = await request<{ entry: MemoryEntry }>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/memory-entries`,
        input
      )
      return res.entry
    },
    async createConnectSession(projectId, input) {
      return request<ConnectSession>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/connect-sessions`,
        input
      )
    },
    async getConnectSession(projectId, token) {
      return request<ConnectSessionView>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/connect-sessions/${encodeURIComponent(token)}`
      )
    },
    async createInvitation(projectId, input) {
      return request<CreateInvitationResult>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/invitations`,
        input
      )
    },
    async listOAuthClients(projectId) {
      const res = await request<{ clients: OAuthClient[] }>(
        'GET',
        `/projects/${encodeURIComponent(projectId)}/oauth-clients`
      )
      return res.clients
    },
    async createOAuthClient(projectId, input) {
      return request<CreateOAuthClientResult>(
        'POST',
        `/projects/${encodeURIComponent(projectId)}/oauth-clients`,
        input
      )
    },
    async updateOAuthClient(projectId, clientId, input) {
      return request<OAuthClient>(
        'PATCH',
        `/projects/${encodeURIComponent(projectId)}/oauth-clients/${encodeURIComponent(clientId)}`,
        input
      )
    },
    async checkProjectPermission(projectId, permission) {
      const qs = new URLSearchParams({ projectId, permission }).toString()
      const res = await request<{ allowed: boolean }>('GET', `/auth/check-permission?${qs}`)
      return res.allowed
    },
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isErrorEnvelope(
  value: unknown
): value is { error: { code: string; message: string; details?: unknown } } {
  if (typeof value !== 'object' || value === null) return false
  const e = (value as { error?: unknown }).error
  if (typeof e !== 'object' || e === null) return false
  const obj = e as { code?: unknown; message?: unknown }
  return typeof obj.code === 'string' && typeof obj.message === 'string'
}
