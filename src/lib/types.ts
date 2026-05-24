export type Step = 'welcome' | 'website' | 'brand' | 'audience' | 'connect-meta' | 'invite'

export const STEP_ORDER: Step[] = [
  'welcome',
  'website',
  'brand',
  'audience',
  'connect-meta',
  'invite',
]

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
  brand?: string
  audience?: string
  websiteUrl?: string
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
