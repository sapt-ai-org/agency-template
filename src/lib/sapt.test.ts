import { describe, expect, it, vi } from 'vitest'
import { SaptApiError, createSaptClient } from './sapt'

function mockFetch(response: {
  status: number
  body: unknown
}): typeof fetch & { calls: { method: string; url: string; body: unknown }[] } {
  const calls: { method: string; url: string; body: unknown }[] = []
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(input),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    })
    return Promise.resolve(
      new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  }) as typeof fetch & { calls: typeof calls }
  impl.calls = calls
  return impl
}

const makeClient = (response: { status: number; body: unknown }) => {
  const fetchImpl = mockFetch(response)
  const client = createSaptClient({
    apiKey: 'sk_test',
    endpoint: 'https://api.example.com',
    fetchImpl,
  })
  return { client, fetchImpl }
}

describe('createSaptClient', () => {
  it('getAuthMe returns the identity payload', async () => {
    const { client, fetchImpl } = makeClient({
      status: 200,
      body: { actorId: 'u1', actorType: 'user', actorName: 'Test' },
    })
    const me = await client.getAuthMe()
    expect(me.actorId).toBe('u1')
    expect(fetchImpl.calls[0]?.method).toBe('GET')
    expect(fetchImpl.calls[0]?.url).toBe('https://api.example.com/auth/me')
  })

  it('listProjects unwraps the projects array', async () => {
    const { client } = makeClient({
      status: 200,
      body: { projects: [{ id: 'p1', name: 'Acme', slug: 'acme' }] },
    })
    const projects = await client.listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0]?.id).toBe('p1')
  })

  it('updateProject sends PATCH with body and unwraps project', async () => {
    const { client, fetchImpl } = makeClient({
      status: 200,
      body: { project: { id: 'p1', name: 'Acme', slug: 'acme' } },
    })
    await client.updateProject('p1', { urls: [{ name: 'website', url: 'https://acme.com' }] })
    expect(fetchImpl.calls[0]?.method).toBe('PATCH')
    expect(fetchImpl.calls[0]?.url).toBe('https://api.example.com/projects/p1')
    expect(fetchImpl.calls[0]?.body).toEqual({
      urls: [{ name: 'website', url: 'https://acme.com' }],
    })
  })

  it('listProjectRoles unwraps the success+data envelope', async () => {
    const { client } = makeClient({
      status: 200,
      body: { success: true, data: [{ id: 'r1', name: 'Admin' }] },
    })
    const roles = await client.listProjectRoles('p1')
    expect(roles).toHaveLength(1)
    expect(roles[0]?.name).toBe('Admin')
  })

  it('createMemoryEntry POSTs and unwraps entry', async () => {
    const { client, fetchImpl } = makeClient({
      status: 201,
      body: { entry: { id: 'm1', slug: 'brand', title: 'Brand', description: '', content: 'X' } },
    })
    await client.createMemoryEntry('p1', {
      slug: 'brand',
      title: 'Brand',
      description: '',
      content: 'X',
    })
    expect(fetchImpl.calls[0]?.method).toBe('POST')
    expect(fetchImpl.calls[0]?.url).toBe('https://api.example.com/projects/p1/memory-entries')
  })

  it('createConnectSession returns the raw payload', async () => {
    const { client } = makeClient({
      status: 201,
      body: {
        connectUrl: 'https://app.sapt.ai/connect/abc',
        token: 'tok',
        expiresAt: '2026-12-31T00:00:00Z',
      },
    })
    const session = await client.createConnectSession('p1', {
      providerId: 'meta',
      clientInvite: true,
    })
    expect(session.token).toBe('tok')
    expect(session.connectUrl).toContain('app.sapt.ai')
  })

  it('getConnectSession returns the status view', async () => {
    const { client, fetchImpl } = makeClient({
      status: 200,
      body: {
        token: 'tok',
        providerId: 'meta',
        status: 'pending',
        expiresAt: '2026-12-31T00:00:00Z',
        completedAt: null,
        error: null,
      },
    })
    const view = await client.getConnectSession('p1', 'tok')
    expect(view.status).toBe('pending')
    expect(fetchImpl.calls[0]?.url).toBe(
      'https://api.example.com/projects/p1/connect-sessions/tok'
    )
  })

  it('createInvitation returns the result payload', async () => {
    const { client } = makeClient({
      status: 201,
      body: {
        invitationId: 'i1',
        email: 'a@b.com',
        action: 'invited',
        expiresAt: null,
      },
    })
    const result = await client.createInvitation('p1', { email: 'a@b.com', projectRoleId: 'r1' })
    expect(result.action).toBe('invited')
  })

  it('parses error envelopes on non-2xx', async () => {
    const { client } = makeClient({
      status: 403,
      body: { error: { code: 'forbidden', message: 'No access' } },
    })
    await expect(client.getAuthMe()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
      message: 'No access',
    })
    await expect(client.getAuthMe()).rejects.toBeInstanceOf(SaptApiError)
  })

  it('handles malformed error bodies', async () => {
    const fetchImpl = (() =>
      Promise.resolve(
        new Response('not json', { status: 500, headers: { 'Content-Type': 'text/plain' } })
      )) as unknown as typeof fetch
    const client = createSaptClient({ apiKey: 'sk', endpoint: 'https://x', fetchImpl })
    await expect(client.getAuthMe()).rejects.toMatchObject({ status: 500, code: 'http_500' })
  })

  it('attaches the ApiKey authorization header', async () => {
    const calls: RequestInit[] = []
    const fetchImpl = ((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init) calls.push(init)
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }) as typeof fetch
    const client = createSaptClient({ apiKey: 'sapt_abc', endpoint: 'https://x', fetchImpl })
    await client.getAuthMe()
    const headers = calls[0]?.headers as Record<string, string>
    expect(headers.Authorization).toBe('ApiKey sapt_abc')
  })
})

vi.stubGlobal('Response', Response)
