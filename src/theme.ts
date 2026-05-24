/**
 * Edit this file to brand your fork. Everything else stays the same.
 *
 *   agencyName      shown in headers, the welcome screen, and the page title
 *   agencyLogoUrl   logo on the landing + questionnaire pages. Can be a local
 *                   path (e.g. "/logo.svg") or an external URL.
 *   primaryColor    HSL triplet (no parentheses, no commas). Maps to Tailwind
 *                   `bg-primary` and friends via the CSS variable in styles.css.
 *   accentColor     same shape; not currently surfaced separately but reserved
 *                   for future use.
 *   welcomeCopy     markdown shown on the public landing page below the logo.
 *   completionCopy  markdown shown after a client finishes the questionnaire.
 */
export const theme = {
  agencyName: 'Your Agency',
  agencyLogoUrl: '/logo.svg',
  primaryColor: '240 6% 10%',
  accentColor: '240 5% 96%',
  welcomeCopy:
    "We'll get you set up in a few minutes. You'll add some context about your business, connect your accounts, and we'll take it from there.",
  completionCopy:
    "All set. Check your email for an invitation to your project — accept it, and we'll be in touch.",
}

export type Theme = typeof theme
