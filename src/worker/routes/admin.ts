import { Hono } from 'hono'
import {
  deleteAgencyConfig,
  deleteLink,
  getAgencyConfig,
  listLinks,
  putAgencyConfig,
  putLink,
} from '@/lib/kv'
import { DEFAULT_AGENCY_CONFIG, type AgencyConfig } from '@/lib/config'
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

adminRoutes.get('/api/admin/config', async (c) => {
  const config = await getAgencyConfig(c.env.LINKS)
  return c.json({ config, defaults: DEFAULT_AGENCY_CONFIG })
})

adminRoutes.put('/api/admin/config', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { config?: AgencyConfig } | null
  if (!body?.config) {
    return c.json({ error: { code: 'bad_request', message: 'Missing `config` field' } }, 400)
  }
  const validationError = validateAgencyConfig(body.config)
  if (validationError) {
    return c.json({ error: { code: 'bad_request', message: validationError } }, 400)
  }
  await putAgencyConfig(c.env.LINKS, body.config)
  return c.json({ config: body.config })
})

adminRoutes.post('/api/admin/config:reset', async (c) => {
  await deleteAgencyConfig(c.env.LINKS)
  return c.json({ config: DEFAULT_AGENCY_CONFIG })
})

/**
 * Lightweight validation for the agency config. We don't need a Zod schema
 * here because the surface is small and the config never crosses a trust
 * boundary — only authenticated admins reach this endpoint. The checks below
 * catch the shapes most likely to break the runtime: missing required theme
 * fields, duplicate question ids, and multiselect questions without options.
 */
function validateAgencyConfig(config: AgencyConfig): string | null {
  if (!config.theme || typeof config.theme !== 'object') return 'theme is required'
  const requiredTheme: (keyof AgencyConfig['theme'])[] = [
    'agencyName',
    'agencyLogoUrl',
    'primaryColor',
    'accentColor',
    'welcomeCopy',
    'completionCopy',
  ]
  for (const key of requiredTheme) {
    if (typeof config.theme[key] !== 'string' || config.theme[key].trim() === '') {
      return `theme.${key} must be a non-empty string`
    }
  }

  if (!config.questionnaire || !Array.isArray(config.questionnaire.questions)) {
    return 'questionnaire.questions must be an array'
  }
  const seen = new Set<string>()
  for (const q of config.questionnaire.questions) {
    if (!q.id || typeof q.id !== 'string') return 'every question needs a string id'
    if (seen.has(q.id)) return `duplicate question id: ${q.id}`
    seen.add(q.id)
    if (q.type !== 'text' && q.type !== 'multiselect') {
      return `question ${q.id}: type must be 'text' or 'multiselect'`
    }
    if (!q.title || typeof q.title !== 'string') {
      return `question ${q.id}: title must be a non-empty string`
    }
    if (q.type === 'multiselect') {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        return `question ${q.id}: multiselect requires at least one option`
      }
      for (const opt of q.options) {
        if (typeof opt.value !== 'string' || typeof opt.label !== 'string') {
          return `question ${q.id}: every option needs string value and label`
        }
      }
    }
  }

  if (!config.memory || typeof config.memory.slug !== 'string' || config.memory.slug.trim() === '') {
    return 'memory.slug is required'
  }
  if (typeof config.memory.title !== 'string' || config.memory.title.trim() === '') {
    return 'memory.title is required'
  }
  if (typeof config.memory.description !== 'string') {
    return 'memory.description must be a string'
  }

  return null
}

function generateLinkId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
