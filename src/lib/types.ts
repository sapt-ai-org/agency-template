/**
 * Step identifier model:
 *   - `welcome`                  — hardcoded landing step (theme-driven copy).
 *   - `question:<id>`            — one configurable question from agency-config.
 *   - `connect-meta`             — hardcoded Meta connect step.
 *   - `invite`                   — hardcoded email-invite step. The flow writes
 *                                  the concatenated memory entry here before
 *                                  sending the invitation.
 *
 * `connect-meta` and `invite` are intentionally not in the configurable list:
 * they have bespoke server-side behavior (connect-session minting, invitation
 * sending) that doesn't generalize to "more data fields."
 */
export type Step = 'welcome' | `question:${string}` | 'connect-meta' | 'invite'

export type LinkStatus = 'pending' | 'completed'

export interface LinkRecord {
  id: string
  projectId: string
  createdAt: string
  status: LinkStatus
  completedAt: string | null
}

export interface ProgressRecord {
  linkId: string
  projectId: string
  currentStep: Step
  /**
   * Answers indexed by question id. `string` for text, `string[]` for
   * multiselect (single-select multiselect still arrives as `string[]` of
   * length 1, which keeps the wire shape uniform).
   */
  answers?: Record<string, string | string[]>
  connectSessionToken?: string
  adminRoleId?: string
  invitedEmail?: string
}

export interface MintLinkInput {
  projectId: string
}

export interface AdminLinkView extends LinkRecord {
  shareUrl: string
}
