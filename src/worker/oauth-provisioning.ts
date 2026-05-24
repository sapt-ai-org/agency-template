/**
 * First-deploy auto-provisioning of the public PKCE OAuth client.
 *
 * Called from /auth/start. On first sign-in:
 *   1. Resolve the API key holder via /auth/me.
 *   2. Pick their first project as the client's home (incidental — the OAuth
 *      client only verifies identity; it isn't bound to the agency's client
 *      projects this template later mints).
 *   3. POST /projects/{projectId}/oauth-clients with `clientType: 'public'` and
 *      the worker's own /auth/callback URL as the sole redirect URL.
 *   4. Cache `{clientId, projectId, redirectURLs}` in KV.
 *
 * On every subsequent sign-in: re-read from KV. If the current request's
 * /auth/callback URL isn't in the client's registered redirect URLs (e.g.
 * agency owner moved to a custom domain, or is testing locally), PATCH the
 * client to append it. Rare path; keeps the deploy-once flow seamless across
 * environments.
 *
 * To force re-provisioning (e.g. you want a fresh client), delete the
 * `oauth-client` KV key from the Cloudflare dashboard.
 */

import { getOAuthClientRecord, putOAuthClientRecord, type OAuthClientRecord } from '@/lib/kv'
import { SaptApiError } from '@/lib/sapt'
import type { WorkerEnv } from './env'
import { saptFromEnv } from './sapt'

const CLIENT_NAME = 'Agency Onboarding Template'

export async function getOrProvisionOAuthClient(
  env: WorkerEnv,
  requestUrl: string
): Promise<OAuthClientRecord> {
  const redirectUrl = new URL('/auth/callback', requestUrl).toString()

  const existing = await getOAuthClientRecord(env.LINKS)
  if (existing) {
    if (!existing.redirectURLs.includes(redirectUrl)) {
      return await appendRedirectUrl(env, existing, redirectUrl)
    }
    return existing
  }

  return await provisionNewClient(env, redirectUrl)
}

async function provisionNewClient(
  env: WorkerEnv,
  redirectUrl: string
): Promise<OAuthClientRecord> {
  const sapt = saptFromEnv(env)

  const projects = await sapt.listProjects()
  if (projects.length === 0) {
    throw new SaptApiError(
      400,
      'no_projects',
      'Your Sapt account has no projects yet. Create one at app.sapt.ai before signing in here.'
    )
  }

  // The OAuth client only verifies identity — the project it lives under is
  // incidental and is not tied to the agency's client projects. We just need
  // one where this API key holds `oauth_clients:write`. Check in `listProjects`
  // order; first hit wins.
  let home: { id: string } | null = null
  for (const project of projects) {
    const allowed = await sapt.checkProjectPermission(project.id, 'oauth_clients:write')
    if (allowed) {
      home = project
      break
    }
  }
  if (!home) {
    throw new SaptApiError(
      403,
      'no_writable_project',
      `Your API key doesn't have 'oauth_clients:write' in any of your ${projects.length} Sapt project(s). Grant it to your role in any project (Project Settings → Roles), or rotate to a reflecting-scope key that inherits it.`
    )
  }

  const result = await sapt.createOAuthClient(home.id, {
    name: CLIENT_NAME,
    redirectURLs: [redirectUrl],
    clientType: 'public',
  })

  const record: OAuthClientRecord = {
    clientId: result.clientId,
    projectId: home.id,
    redirectURLs: result.client.redirectURLs,
  }
  await putOAuthClientRecord(env.LINKS, record)
  return record
}

async function appendRedirectUrl(
  env: WorkerEnv,
  existing: OAuthClientRecord,
  redirectUrl: string
): Promise<OAuthClientRecord> {
  const sapt = saptFromEnv(env)
  const nextRedirectUrls = [...existing.redirectURLs, redirectUrl]
  const updated = await sapt.updateOAuthClient(existing.projectId, existing.clientId, {
    redirectURLs: nextRedirectUrls,
  })

  const record: OAuthClientRecord = {
    clientId: existing.clientId,
    projectId: existing.projectId,
    redirectURLs: updated.redirectURLs,
  }
  await putOAuthClientRecord(env.LINKS, record)
  return record
}
