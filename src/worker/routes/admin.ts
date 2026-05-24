import { Hono } from 'hono'
import { deleteLink, listLinks, putLink } from '@/lib/kv'
import type { AdminLinkView, LinkRecord, MintLinkInput } from '@/lib/types'
import type { AppBindings } from '../env'
import { saptFromEnv } from '../sapt'
import { requireSession } from '../session'

export const adminRoutes = new Hono<AppBindings>()

// Scope the session check to /api/admin/*. Mounting the routers at '/' makes
// Hono apply this middleware globally if it uses '*', which is wrong — the
// public questionnaire endpoints (/api/steps/...) must remain reachable
// without a session.
adminRoutes.use('/api/admin/*', async (c, next) => {
  const session = await requireSession(c)
  if (session instanceof Response) return session
  return next()
})

adminRoutes.get('/api/admin/projects', async (c) => {
  const sapt = saptFromEnv(c.env)
  const projects = await sapt.listProjects()
  return c.json({ projects })
})

adminRoutes.get('/api/admin/links', async (c) => {
  const links = await listLinks(c.env.LINKS)
  const origin = new URL(c.req.url).origin
  const enriched: AdminLinkView[] = links
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((link) => ({
      ...link,
      shareUrl: `${origin}/start/${link.id}`,
    }))
  return c.json({ links: enriched })
})

adminRoutes.post('/api/admin/links', async (c) => {
  const input = (await c.req.json()) as MintLinkInput
  if (!input.projectId || typeof input.projectId !== 'string') {
    return c.json({ error: { code: 'bad_request', message: 'projectId is required' } }, 400)
  }

  const record: LinkRecord = {
    id: generateLinkId(),
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    completedAt: null,
  }
  await putLink(c.env.LINKS, record)
  const shareUrl = `${new URL(c.req.url).origin}/start/${record.id}`
  return c.json({ link: { ...record, shareUrl } }, 201)
})

adminRoutes.delete('/api/admin/links/:linkId', async (c) => {
  const linkId = c.req.param('linkId')
  await deleteLink(c.env.LINKS, linkId)
  return c.json({ ok: true })
})

function generateLinkId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
