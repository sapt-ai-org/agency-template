import { createSaptClient, type SaptClient } from '@/lib/sapt'
import type { WorkerEnv } from './env'

export function saptFromEnv(env: WorkerEnv): SaptClient {
  return createSaptClient({ apiKey: env.SAPT_API_KEY, endpoint: env.SAPT_ENDPOINT })
}
