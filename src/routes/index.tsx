import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AgencyTheme } from '@/lib/config'
import { DEFAULT_AGENCY_CONFIG } from '@/lib/config'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const [theme, setTheme] = useState<AgencyTheme>(DEFAULT_AGENCY_CONFIG.theme)

  useEffect(() => {
    let cancelled = false
    fetch('/api/public/theme')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { theme?: AgencyTheme } | null) => {
        if (!cancelled && body?.theme) setTheme(body.theme)
      })
      .catch(() => {
        /* fall back to defaults — landing page should never block on this */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <img src={theme.agencyLogoUrl} alt={theme.agencyName} className="size-16" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{theme.agencyName}</h1>
      <p className="text-muted-foreground mt-3 max-w-md text-center text-sm leading-relaxed">
        {theme.welcomeCopy}
      </p>
      <Button className="mt-8" onClick={() => (window.location.href = '/auth/start')}>
        Sign in with Sapt
      </Button>
    </div>
  )
}
