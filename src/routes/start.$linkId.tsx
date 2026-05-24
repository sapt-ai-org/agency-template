import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AgencyConfig } from '@/lib/config'
import { DEFAULT_AGENCY_CONFIG } from '@/lib/config'
import type { LinkRecord, ProgressRecord, Step } from '@/lib/types'
import { buildSteps } from '@/questionnaire/steps'

export const Route = createFileRoute('/start/$linkId')({
  component: QuestionnairePage,
})

interface FetchState {
  link: LinkRecord
  progress: ProgressRecord
  config: AgencyConfig
}

function QuestionnairePage() {
  const { linkId } = Route.useParams()
  const [state, setState] = useState<FetchState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/steps/${linkId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setLoadError('This onboarding link is invalid or has expired.')
          return
        }
        if (!res.ok) {
          if (!cancelled) setLoadError('Could not load this onboarding session.')
          return
        }
        const body = (await res.json()) as FetchState
        if (cancelled) return
        if (body.link.status === 'completed') {
          setDone(true)
          setState(body)
        } else {
          setState(body)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this onboarding session.')
      })
    return () => {
      cancelled = true
    }
  }, [linkId])

  const steps = useMemo(() => buildSteps(state?.config ?? DEFAULT_AGENCY_CONFIG), [state?.config])

  const handleSubmit = useCallback(
    async (stepName: Step, body: Record<string, unknown>) => {
      setSubmitting(true)
      setSubmitError(null)
      try {
        const res = await fetch(`/api/steps/${linkId}/${encodeURIComponent(stepName)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          setSubmitError(data?.error?.message ?? 'Something went wrong. Please try again.')
          return
        }
        const data = (await res.json()) as { progress: ProgressRecord }
        const fresh = await fetch(`/api/steps/${linkId}`)
        const refreshed = (await fresh.json()) as FetchState
        if (refreshed.link.status === 'completed') {
          setState(refreshed)
          setDone(true)
        } else {
          setState({
            link: refreshed.link,
            progress: data.progress,
            config: refreshed.config,
          })
        }
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Network error')
      } finally {
        setSubmitting(false)
      }
    },
    [linkId]
  )

  const handleBack = useCallback(() => {
    if (!state) return
    const idx = steps.findIndex((s) => s.step === state.progress.currentStep)
    if (idx <= 0) return
    const prev = steps[idx - 1]
    if (!prev) return
    setState({ ...state, progress: { ...state.progress, currentStep: prev.step } })
    setSubmitError(null)
  }, [state, steps])

  const currentDef = useMemo(() => {
    if (!state) return null
    return steps.find((s) => s.step === state.progress.currentStep)
  }, [state, steps])

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-xl font-semibold">{loadError}</h1>
      </div>
    )
  }

  if (done && state) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <img src={state.config.theme.agencyLogoUrl} alt={state.config.theme.agencyName} className="size-12" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re all set</h1>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          {state.config.theme.completionCopy}
        </p>
        <Button className="mt-8" onClick={() => (window.location.href = 'https://app.sapt.ai')}>
          Continue in Sapt
        </Button>
      </div>
    )
  }

  if (!state || !currentDef) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    )
  }

  const StepComponent = currentDef.Component
  return (
    <StepComponent
      progress={state.progress}
      config={state.config}
      submitting={submitting}
      error={submitError}
      onSubmit={(body) => handleSubmit(state.progress.currentStep, body)}
      onBack={handleBack}
    />
  )
}
