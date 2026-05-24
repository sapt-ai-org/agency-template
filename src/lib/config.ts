/**
 * Runtime configuration the agency owner can edit at `/admin/config`.
 *
 * Persisted under the KV key `agency-config`. When KV has no entry yet the
 * runtime falls back to `DEFAULT_AGENCY_CONFIG`, which mirrors the previously
 * hardcoded theme + two-question flow.
 *
 * Shape rationale:
 *   - `theme`         visual brand. Was `src/theme.ts`; that file is now the
 *                     defaults source only.
 *   - `questionnaire` ordered list of question definitions. Only `text` and
 *                     `multiselect` types exist — extend the union with a
 *                     matching React component to add a new type. The Meta
 *                     connect step and the email-invite step are hardcoded at
 *                     the end of the flow and aren't configurable here.
 *   - `memory`        controls how the concatenated questionnaire answers are
 *                     written to the Sapt memory entry at flow completion.
 */

import { theme as defaultTheme } from '@/theme'

export interface AgencyTheme {
  agencyName: string
  agencyLogoUrl: string
  primaryColor: string
  accentColor: string
  welcomeCopy: string
  completionCopy: string
}

export interface TextQuestion {
  id: string
  type: 'text'
  title: string
  description?: string
  placeholder?: string
  maxLength?: number
  rows?: number
  required?: boolean
}

export interface MultiselectQuestion {
  id: string
  type: 'multiselect'
  title: string
  description?: string
  options: { value: string; label: string }[]
  /** When true, multiple options can be selected. Defaults to false. */
  multi?: boolean
  required?: boolean
}

export type Question = TextQuestion | MultiselectQuestion

export interface MemoryConfig {
  slug: string
  title: string
  description: string
}

export interface AgencyConfig {
  theme: AgencyTheme
  questionnaire: {
    questions: Question[]
    /** Welcome-screen title and continue-button label. */
    welcomeButtonLabel?: string
  }
  memory: MemoryConfig
}

export const DEFAULT_AGENCY_CONFIG: AgencyConfig = {
  theme: defaultTheme,
  questionnaire: {
    questions: [
      {
        id: 'brand',
        type: 'text',
        title: 'Tell us about your business',
        description:
          'What do you do? Who do you serve? What makes your voice yours? A paragraph or two is plenty.',
        placeholder: "We're an indie skincare brand…",
        maxLength: 2000,
        rows: 6,
        required: true,
      },
      {
        id: 'audience',
        type: 'text',
        title: "Who's your audience?",
        description:
          'The people you make this for. Demographics, interests, what they care about — whatever matters.',
        placeholder: 'Mostly women 25–40 who care about clean ingredients…',
        maxLength: 2000,
        rows: 6,
        required: true,
      },
    ],
  },
  memory: {
    slug: 'client-onboarding',
    title: 'Client onboarding',
    description: 'Captured during onboarding.',
  },
}
