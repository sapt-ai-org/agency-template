import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AgencyConfig } from '@/lib/config'
import { DEFAULT_AGENCY_CONFIG } from '@/lib/config'

export const Route = createFileRoute('/admin/config')({
  component: AdminConfigPage,
})

interface ConfigResponse {
  config: AgencyConfig
  defaults: AgencyConfig
}

function AdminConfigPage() {
  const navigate = useNavigate()
  const [serverConfig, setServerConfig] = useState<AgencyConfig | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/config')
      .then(async (res) => {
        if (res.status === 401) {
          navigate({ to: '/' })
          return
        }
        if (!res.ok) throw new Error('Failed to load config')
        const body = (await res.json()) as ConfigResponse
        if (cancelled) return
        setServerConfig(body.config)
        setDraft(JSON.stringify(body.config, null, 2))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const dirty = useMemo(() => {
    if (!serverConfig) return false
    try {
      return JSON.stringify(JSON.parse(draft)) !== JSON.stringify(serverConfig)
    } catch {
      return true
    }
  }, [draft, serverConfig])

  const handleSave = async () => {
    setStatus(null)
    setError(null)
    let parsed: AgencyConfig
    try {
      parsed = JSON.parse(draft) as AgencyConfig
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : 'parse error'}`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: parsed }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        setError(body?.error?.message ?? `Save failed (${res.status})`)
        return
      }
      const body = (await res.json()) as { config: AgencyConfig }
      setServerConfig(body.config)
      setDraft(JSON.stringify(body.config, null, 2))
      setStatus('Saved.')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm('Reset config to defaults? Your current config will be discarded.')) return
    setStatus(null)
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config:reset', { method: 'POST' })
      if (!res.ok) {
        setError(`Reset failed (${res.status})`)
        return
      }
      const body = (await res.json()) as { config: AgencyConfig }
      setServerConfig(body.config)
      setDraft(JSON.stringify(body.config, null, 2))
      setStatus('Reset to defaults.')
    } finally {
      setSaving(false)
    }
  }

  const handleLoadDefaults = () => {
    setDraft(JSON.stringify(DEFAULT_AGENCY_CONFIG, null, 2))
    setStatus('Defaults loaded into editor (not saved yet).')
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link to="/admin" className="text-muted-foreground text-sm hover:underline">
            ← Back to admin
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Configure</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Edit the agency theme and onboarding questions. Saves immediately and applies to every
            client link from then on.
          </p>
        </div>
      </header>

      {error && (
        <div className="border-destructive/40 bg-destructive/5 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {status && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {status}
        </div>
      )}

      <textarea
        spellCheck={false}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setStatus(null)
        }}
        className="border-input bg-background min-h-[480px] w-full rounded-md border p-3 font-mono text-xs"
      />

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleLoadDefaults} disabled={saving}>
            Load defaults
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
            Reset to defaults
          </Button>
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
