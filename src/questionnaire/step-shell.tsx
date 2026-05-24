import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { AgencyTheme } from '@/lib/config'

interface StepShellProps {
  theme: AgencyTheme
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  error?: string | null
  onBack?: () => void
  showBack: boolean
}

export function StepShell({
  theme,
  title,
  description,
  children,
  footer,
  error,
  onBack,
  showBack,
}: StepShellProps) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-6 py-12">
      <header className="mb-12 flex items-center gap-3">
        <img src={theme.agencyLogoUrl} alt={theme.agencyName} className="size-8" />
        <span className="text-sm font-medium">{theme.agencyName}</span>
      </header>

      <main className="flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{description}</p>
        )}

        <div className="mt-8">{children}</div>

        {error && <p className="text-destructive mt-4 text-sm">{error}</p>}
      </main>

      <footer className="mt-12 flex items-center justify-between">
        {showBack && onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {footer}
      </footer>
    </div>
  )
}
