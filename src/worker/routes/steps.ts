import { Hono } from 'hono'
import { getAgencyConfig, getLink, getProgress, putLink, putProgress } from '@/lib/kv'
import type { AgencyConfig, Question } from '@/lib/config'
import { buildMemoryContent } from '@/lib/memory-content'
import type { LinkRecord, ProgressRecord, Step } from '@/lib/types'
import { SaptApiError, type SaptClient } from '@/lib/sapt'
import type { AppBindings, WorkerEnv } from '../env'
import { saptFromEnv } from '../sapt'

export const stepsRoutes = new Hono<AppBindings>()

// Public read-only theme. The landing page and any pre-questionnaire UI
// renders from this so unauthenticated visitors see the configured branding
// rather than a hardcoded fallback. The questionnaire itself reads the full
// config via /api/steps/:linkId (which is also public — onboarding links are
// the unauthenticated entrypoint by design).
stepsRoutes.get('/api/public/theme', async (c) => {
  const config = await getAgencyConfig(c.env.LINKS)
  return c.json({ theme: config.theme })
})

stepsRoutes.get('/api/steps/:linkId', async (c) => {
  const linkId = c.req.param('linkId')
  const link = await getLink(c.env.LINKS, linkId)
  if (!link) return c.json({ error: { code: 'not_found', message: 'Link not found' } }, 404)
  const config = await getAgencyConfig(c.env.LINKS)
  const progress = await getProgress(c.env.LINKS, linkId)
  return c.json({
    link,
    progress: progress ?? bootstrapProgress(link, config),
    config,
  })
})

stepsRoutes.post('/api/steps/:linkId/*', async (c) => {
  const linkId = c.req.param('linkId')
  // Strip the `/api/steps/:linkId/` prefix from the path to get the raw step
  // name (which may contain a colon, e.g. `question:brand`).
  const stepName = decodeURIComponent(
    new URL(c.req.url).pathname.replace(`/api/steps/${linkId}/`, '')
  ) as Step

  const link = await getLink(c.env.LINKS, linkId)
  if (!link) return c.json({ error: { code: 'not_found', message: 'Link not found' } }, 404)
  if (link.status === 'completed') {
    return c.json({ error: { code: 'already_completed', message: 'Already completed' } }, 409)
  }

  const config = await getAgencyConfig(c.env.LINKS)
  const progress = (await getProgress(c.env.LINKS, linkId)) ?? bootstrapProgress(link, config)
  const sapt = saptFromEnv(c.env)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const result = await runStep(stepName, { sapt, env: c.env, link, progress, body, config })
    if (result.progress) await putProgress(c.env.LINKS, result.progress)
    if (result.linkUpdate) await putLink(c.env.LINKS, result.linkUpdate)
    return c.json({ progress: result.progress ?? progress, payload: result.payload ?? null })
  } catch (err) {
    if (err instanceof SaptApiError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        statusOrDefault(err.status)
      )
    }
    throw err
  }
})

type StepResult = {
  progress?: ProgressRecord
  linkUpdate?: LinkRecord
  payload?: unknown
}

interface StepContext {
  sapt: SaptClient
  env: WorkerEnv
  link: LinkRecord
  progress: ProgressRecord
  body: Record<string, unknown>
  config: AgencyConfig
}

async function runStep(name: Step, ctx: StepContext): Promise<StepResult> {
  const order = stepOrder(ctx.config)

  if (name === 'welcome') {
    return { progress: advance(ctx.progress, 'welcome', order) }
  }

  if (name === 'connect-meta') {
    return await runConnectMeta(ctx, order)
  }

  if (name === 'invite') {
    return await runInvite(ctx)
  }

  if (name.startsWith('question:')) {
    const questionId = name.slice('question:'.length)
    const question = ctx.config.questionnaire.questions.find((q) => q.id === questionId)
    if (!question) {
      throw new SaptApiError(404, 'unknown_question', `Unknown question: ${questionId}`)
    }
    const answer = extractAnswer(question, ctx.body)
    const nextAnswers = { ...(ctx.progress.answers ?? {}), [question.id]: answer }
    return { progress: advance({ ...ctx.progress, answers: nextAnswers }, name, order) }
  }

  throw new SaptApiError(400, 'unknown_step', `Unknown step: ${name}`)
}

async function runConnectMeta(ctx: StepContext, order: Step[]): Promise<StepResult> {
  const action = typeof ctx.body.action === 'string' ? ctx.body.action : 'start'

  if (action === 'skip') {
    return { progress: advance(ctx.progress, 'connect-meta', order) }
  }

  if (action === 'poll') {
    if (!ctx.progress.connectSessionToken) {
      return { payload: { status: 'pending' as const } }
    }
    const view = await ctx.sapt.getConnectSession(
      ctx.link.projectId,
      ctx.progress.connectSessionToken
    )
    // Only auto-advance on a successful connect. On failed/expired we leave
    // the client on the step so the UI can surface the error and let the
    // user retry or skip.
    if (view.status === 'completed') {
      return {
        progress: advance(ctx.progress, 'connect-meta', order),
        payload: view,
      }
    }
    return { payload: view }
  }

  // Always mint a fresh connect-session on "start". Re-clicking the button
  // after a failure or a long wait should give a usable URL, not try to
  // reanimate the previous (possibly expired) session.
  const session = await ctx.sapt.createConnectSession(ctx.link.projectId, {
    providerId: 'meta',
    clientInvite: true,
  })
  return {
    progress: { ...ctx.progress, connectSessionToken: session.token },
    payload: session,
  }
}

async function runInvite(ctx: StepContext): Promise<StepResult> {
  const email = mustString(ctx.body, 'email')

  let roleId = ctx.progress.adminRoleId
  if (!roleId) {
    const roles = await ctx.sapt.listProjectRoles(ctx.link.projectId)
    const admin = roles.find((r) => r.name.toLowerCase() === 'admin') ?? roles[0]
    if (!admin) {
      throw new SaptApiError(500, 'no_role', 'No project role available to assign to the invitee.')
    }
    roleId = admin.id
  }

  // Write the single consolidated memory entry from all collected answers
  // before sending the invitation. The service layer slugifies and
  // deconflicts, so re-submissions (or multiple clients per project) don't
  // collide. Skip entirely if there are no answers to record — keeps the
  // memory list clean for purely connect/invite flows.
  const answers = ctx.progress.answers ?? {}
  const content = buildMemoryContent(ctx.config.questionnaire.questions, answers)
  if (content.trim() !== '') {
    await ctx.sapt.createMemoryEntry(ctx.link.projectId, {
      slug: ctx.config.memory.slug,
      title: ctx.config.memory.title,
      description: ctx.config.memory.description,
      content,
    })
  }

  // Only invite once per email. If the user re-submits after a transient
  // failure with the same email, we skip the second invitation send and
  // proceed to completing the link. Different emails trigger a fresh send.
  if (ctx.progress.invitedEmail !== email) {
    await ctx.sapt.createInvitation(ctx.link.projectId, { email, projectRoleId: roleId })
  }

  const completedAt = new Date().toISOString()
  const updatedLink: LinkRecord = {
    ...ctx.link,
    status: 'completed',
    completedAt,
  }
  return {
    progress: {
      ...ctx.progress,
      adminRoleId: roleId,
      invitedEmail: email,
      currentStep: 'invite',
    },
    linkUpdate: updatedLink,
  }
}

/**
 * Pull an answer out of the request body. For `text` questions we require a
 * non-empty `content` string when the question is required; for `multiselect`
 * we require an `options` array (and at most one element if `multi` is
 * false). Validation here mirrors the constraints the UI enforces so a bad
 * client can't bypass them.
 */
function extractAnswer(question: Question, body: Record<string, unknown>): string | string[] {
  if (question.type === 'text') {
    const raw = body.content
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (question.required !== false && value === '') {
      throw new SaptApiError(400, 'bad_request', `${question.title}: an answer is required.`)
    }
    if (question.maxLength !== undefined && value.length > question.maxLength) {
      throw new SaptApiError(
        400,
        'bad_request',
        `${question.title}: answer exceeds ${question.maxLength} characters.`
      )
    }
    return value
  }

  // multiselect
  const raw = body.options
  const values = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  if (question.required !== false && values.length === 0) {
    throw new SaptApiError(400, 'bad_request', `${question.title}: pick at least one option.`)
  }
  if (!question.multi && values.length > 1) {
    throw new SaptApiError(400, 'bad_request', `${question.title}: only one option allowed.`)
  }
  const allowed = new Set(question.options.map((o) => o.value))
  const filtered = values.filter((v) => allowed.has(v))
  if (filtered.length !== values.length) {
    throw new SaptApiError(400, 'bad_request', `${question.title}: unknown option submitted.`)
  }
  return filtered
}

function stepOrder(config: AgencyConfig): Step[] {
  const questionSteps: Step[] = config.questionnaire.questions.map(
    (q) => `question:${q.id}` satisfies Step
  )
  return ['welcome', ...questionSteps, 'connect-meta', 'invite']
}

function advance(progress: ProgressRecord, completed: Step, order: Step[]): ProgressRecord {
  const idx = order.indexOf(completed)
  const next = order[idx + 1] ?? completed
  return { ...progress, currentStep: next }
}

function bootstrapProgress(link: LinkRecord, config: AgencyConfig): ProgressRecord {
  const order = stepOrder(config)
  return {
    linkId: link.id,
    projectId: link.projectId,
    currentStep: order[0] ?? 'welcome',
  }
}

function mustString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SaptApiError(400, 'bad_request', `Missing required field: ${key}`)
  }
  return value
}

function statusOrDefault(s: number): 400 | 401 | 403 | 404 | 409 | 500 | 502 {
  if (s === 400 || s === 401 || s === 403 || s === 404 || s === 409 || s === 500 || s === 502) {
    return s
  }
  return 500
}
