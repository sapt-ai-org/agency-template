import type { AgencyConfig } from '@/lib/config'
import { ConnectMetaStep } from './steps/connect-meta'
import { InviteStep } from './steps/invite'
import { makeMultiselectQuestionStep } from './steps/multiselect-question'
import { makeTextQuestionStep } from './steps/text-question'
import { WelcomeStep } from './steps/welcome'
import type { StepDefinition } from './types'

/**
 * Build the ordered step list for a given runtime config. Welcome leads,
 * Meta connect + invite tail. Everything between is generated from
 * `config.questionnaire.questions` (one step per question, in array order).
 */
export function buildSteps(config: AgencyConfig): StepDefinition[] {
  const questionSteps: StepDefinition[] = config.questionnaire.questions.map((question) => ({
    step: `question:${question.id}`,
    title: question.title,
    description: question.description,
    Component:
      question.type === 'text'
        ? makeTextQuestionStep(question)
        : makeMultiselectQuestionStep(question),
    showBack: true,
  }))

  return [
    { step: 'welcome', title: 'Welcome', Component: WelcomeStep, showBack: false },
    ...questionSteps,
    { step: 'connect-meta', title: 'Connect Meta', Component: ConnectMetaStep, showBack: true },
    { step: 'invite', title: 'Invite', Component: InviteStep, showBack: true },
  ]
}
