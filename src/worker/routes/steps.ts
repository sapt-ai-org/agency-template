import { Hono } from 'hono'
import { getLink, getProgress, putLink, putProgress } from '@/lib/kv'
import type { LinkRecord, ProgressRecord, Step } from '@/lib/types'
import { STEP_ORDER } from '@/lib/types'
import { SaptApiError, type SaptClient } from '@/lib/sapt'
import type { AppBindings, WorkerEnv } from '../env'
import { saptFromEnv } from '../sapt'

export const stepsRoutes = new Hono<AppBindings>()

stepsRoutes.get('/api/steps/:linkId', async (c) => {
  const linkId = c.req.param('linkId')
  const link = await getLink(c.env.LINKS, linkId)
  if (!link) return c.json({ error: { code: 'not_found', message: 'Link not found' } }, 404)
  const progress = await getProgress(c.env.LINKS, linkId)
  return c.json({ link, progress: progress ?? bootstrapProgress(link) })
})

stepsRoutes.post('/api/steps/:linkId/:stepName', async (c) => {
  const linkId = c.req.param('linkId')
  const stepName = c.req.param('stepName') as Step

  const link = await getLink(c.env.LINKS, linkId)
  if (!link) return c.json({ error: { code: 'not_found', message: 'Link not found' } }, 404)
  if (link.status === 'completed') {
    return c.json({ error: { code: 'already_completed', message: 'Already completed' } }, 409)
  }

  const progress = (await getProgress(c.env.LINKS, linkId)) ?? bootstrapProgress(link)
  const sapt = saptFromEnv(c.env)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const result = await runStep(stepName, { sapt, env: c.env, link, progress, body })
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
}

async function runStep(name: Step, ctx: StepContext): Promise<StepResult> {
  switch (name) {
    case 'welcome':
      return { progress: advance(ctx.progress, 'welcome') }

    case 'brand': {
      const content = mustString(ctx.body, 'content')
      await ctx.sapt.createMemoryEntry(ctx.link.projectId, {
        slug: 'onboarding-brand',
        title: 'Brand context',
        description: 'Captured during onboarding.',
        content,
      })
      return { progress: advance({ ...ctx.progress, brand: content }, 'brand') }
    }

    case 'audience': {
      const content = mustString(ctx.body, 'content')
      await ctx.sapt.createMemoryEntry(ctx.link.projectId, {
        slug: 'onboarding-audience',
        title: 'Target audience',
        description: 'Captured during onboarding.',
        content,
      })
      return { progress: advance({ ...ctx.progress, audience: content }, 'audience') }
    }

    case 'connect-meta': {
      const action = typeof ctx.body.action === 'string' ? ctx.body.action : 'start'

      if (action === 'skip') {
        return { progress: advance(ctx.progress, 'connect-meta') }
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
        // user retry or skip — advancing here would silently move past a
        // broken Meta flow.
        if (view.status === 'completed') {
          return {
            progress: advance(ctx.progress, 'connect-meta'),
            payload: view,
          }
        }
        return { payload: view }
      }

      // Always mint a fresh connect-session on "start". Re-clicking the
      // button after a failure or a long wait should give a usable URL,
      // not try to reanimate the previous (possibly expired) session.
      const session = await ctx.sapt.createConnectSession(ctx.link.projectId, {
        providerId: 'meta',
        clientInvite: true,
      })
      return {
        progress: { ...ctx.progress, connectSessionToken: session.token },
        payload: session,
      }
    }

    case 'invite': {
      const email = mustString(ctx.body, 'email')

      let roleId = ctx.progress.adminRoleId
      if (!roleId) {
        const roles = await ctx.sapt.listProjectRoles(ctx.link.projectId)
        const admin = roles.find((r) => r.name.toLowerCase() === 'admin') ?? roles[0]
        if (!admin) {
          throw new SaptApiError(
            500,
            'no_role',
            'No project role available to assign to the invitee.'
          )
        }
        roleId = admin.id
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

    default:
      throw new SaptApiError(400, 'unknown_step', `Unknown step: ${name}`)
  }
}

function advance(progress: ProgressRecord, completed: Step): ProgressRecord {
  const idx = STEP_ORDER.indexOf(completed)
  const next = STEP_ORDER[idx + 1] ?? completed
  return { ...progress, currentStep: next }
}

function bootstrapProgress(link: LinkRecord): ProgressRecord {
  return {
    linkId: link.id,
    projectId: link.projectId,
    currentStep: 'welcome',
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
