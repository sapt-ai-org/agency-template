import type { StepDefinition } from './types'
import { WelcomeStep } from './steps/welcome'
import { BrandStep } from './steps/brand'
import { AudienceStep } from './steps/audience'
import { ConnectMetaStep } from './steps/connect-meta'
import { InviteStep } from './steps/invite'

export const STEPS: StepDefinition[] = [
  { step: 'welcome', title: 'Welcome', Component: WelcomeStep, showBack: false },
  { step: 'brand', title: 'Brand context', Component: BrandStep, showBack: true },
  { step: 'audience', title: 'Audience', Component: AudienceStep, showBack: true },
  { step: 'connect-meta', title: 'Connect Meta', Component: ConnectMetaStep, showBack: true },
  { step: 'invite', title: 'Invite', Component: InviteStep, showBack: true },
]
