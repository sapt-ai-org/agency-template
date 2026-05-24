import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { theme } from '@/theme'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
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
