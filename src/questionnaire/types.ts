import type { AgencyConfig } from '@/lib/config'
import type { ProgressRecord, Step } from '@/lib/types'

export interface StepProps {
  progress: ProgressRecord
  config: AgencyConfig
  submitting: boolean
  error: string | null
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  onBack: () => void
}

export interface StepDefinition {
  step: Step
  title: string
  description?: string
  Component: (props: StepProps) => React.JSX.Element
  /** If true, the questionnaire renders a "back" button. Welcome has none. */
  showBack: boolean
}
