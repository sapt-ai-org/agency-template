export interface WorkerEnv {
  SAPT_API_KEY: string
  /**
   * Public OAuth client id. The matching OAuth client must be created in Sapt
   * as a `public` (PKCE) client — no client secret, no `SAPT_OAUTH_CLIENT_SECRET`.
   */
  SAPT_OAUTH_CLIENT_ID: string
  /**
   * Sapt's REST + auth origin. The Better Auth OIDC provider mounts at
   * `/api/auth/oauth2/*` on this host, and the public REST API is at the same
   * origin. In production this is `https://api.sapt.ai`.
   */
  SAPT_ENDPOINT: string
  LINKS: KVNamespace
  ASSETS: Fetcher
}

export type AppBindings = { Bindings: WorkerEnv }
