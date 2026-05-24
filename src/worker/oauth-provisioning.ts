/**
 * First-deploy auto-provisioning of the public PKCE OAuth client.
 *
 * Called from /auth/start. Idempotent across KV wipes: if there's no cached
 * client, we first look for an existing client named CLIENT_NAME in any
 * project the API key can write OAuth clients to, and adopt it rather than
 * creating a duplicate. Only create a new client when nothing matches.
 *
 * Subsequent sign-ins re-read from KV. If the current request's /auth/callback
 * URL isn't in the client's registered redirect URLs (e.g. agency owner moved
 * to a custom domain, or is testing locally), PATCH the client to append it.
 *
 * To force re-provisioning, delete the `oauth-client` KV key from the
 * Cloudflare dashboard.
 */

import { getOAuthClientRecord, putOAuthClientRecord, type OAuthClientRecord } from '@/lib/kv'
import { SaptApiError, type OAuthClient } from '@/lib/sapt'
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

  // Find a project where the API key holds `oauth_clients:write`. The OAuth
  // client only verifies identity — the project it lives under is incidental.
  // Once we find a writable project, look for an existing CLIENT_NAME client
  // to adopt (idempotent across KV wipes) and only create when nothing
  // matches.
  let home: { id: string } | null = null
  let existing: OAuthClient | null = null
  for (const project of projects) {
    const allowed = await sapt.checkProjectPermission(project.id, 'oauth_clients:write')
    if (!allowed) continue

    const clients = await sapt.listOAuthClients(project.id)
    const match = clients.find((c) => c.name === CLIENT_NAME && c.type === 'public' && !c.disabled)
    if (match) {
      home = project
      existing = match
      break
    }
    // Remember the first writable project so we can create the client there
    // if no existing CLIENT_NAME client turns up in any other writable project.
    if (!home) home = project
  }

  if (!home) {
    throw new SaptApiError(
      403,
      'no_writable_project',
      `Your API key doesn't have 'oauth_clients:write' in any of your ${projects.length} Sapt project(s). Grant it to your role in any project (Project Settings → Roles), or rotate to a reflecting-scope key that inherits it.`
    )
  }

  if (existing) {
    // Adopt the existing client. Append the current redirect URL if missing.
    const redirectURLs = existing.redirectURLs.includes(redirectUrl)
      ? existing.redirectURLs
      : [...existing.redirectURLs, redirectUrl]

    if (redirectURLs.length !== existing.redirectURLs.length) {
      const updated = await sapt.updateOAuthClient(home.id, existing.clientId, { redirectURLs })
      const record: OAuthClientRecord = {
        clientId: existing.clientId,
        projectId: home.id,
        redirectURLs: updated.redirectURLs,
      }
      await putOAuthClientRecord(env.LINKS, record)
      return record
    }

    const record: OAuthClientRecord = {
      clientId: existing.clientId,
      projectId: home.id,
      redirectURLs: existing.redirectURLs,
    }
    await putOAuthClientRecord(env.LINKS, record)
    return record
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
