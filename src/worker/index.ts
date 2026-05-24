/**
 * Worker code uses **relative imports** for everything under `src/lib/` and
 * `src/theme.ts`. The `@/` alias is honored by Vite and the TS language
 * server but Wrangler's bundler ignores it (it doesn't read tsconfig
 * `paths`, and its own `alias` map has no wildcard form). Adding files via
 * `@/` here will break `npm run dev` and `npm run deploy`. Frontend code
 * under `src/routes/`, `src/components/`, `src/questionnaire/` keeps the
 * `@/` alias since Vite handles the SPA build.
 */

import { Hono } from 'hono'
import { authRoutes } from './routes/auth'
import { adminRoutes } from './routes/admin'
import { stepsRoutes } from './routes/steps'
import type { AppBindings } from './env'

const app = new Hono<AppBindings>()

app.route('/', authRoutes)
app.route('/', adminRoutes)
app.route('/', stepsRoutes)

app.onError((err, c) => {
  // Log the full error server-side; return a generic message to the client so
  // we never leak stack traces, env secrets, or third-party error details.
  console.error('Unhandled error:', err)
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500)
})

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
