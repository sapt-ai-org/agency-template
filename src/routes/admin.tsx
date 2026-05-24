import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AgencyConfig } from '@/lib/config'
import { DEFAULT_AGENCY_CONFIG } from '@/lib/config'
import type { AdminLinkView } from '@/lib/types'
import type { SaptProject } from '@/lib/sapt'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

function AdminPage() {
  const navigate = useNavigate()
  const [links, setLinks] = useState<AdminLinkView[] | null>(null)
  const [projects, setProjects] = useState<SaptProject[] | null>(null)
  const [config, setConfig] = useState<AgencyConfig>(DEFAULT_AGENCY_CONFIG)
  const [showMint, setShowMint] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/admin/links'),
      fetch('/api/admin/projects'),
      fetch('/api/admin/config'),
    ])
      .then(async ([linksRes, projectsRes, configRes]) => {
        if (linksRes.status === 401 || projectsRes.status === 401 || configRes.status === 401) {
          navigate({ to: '/' })
          return
        }
        if (!linksRes.ok || !projectsRes.ok || !configRes.ok) {
          throw new Error('Failed to load admin data')
        }
        const linksBody = (await linksRes.json()) as { links: AdminLinkView[] }
        const projectsBody = (await projectsRes.json()) as { projects: SaptProject[] }
        const configBody = (await configRes.json()) as { config: AgencyConfig }
        if (cancelled) return
        setLinks(linksBody.links)
        setProjects(projectsBody.projects)
        setConfig(configBody.config)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const refresh = async () => {
    const res = await fetch('/api/admin/links')
    if (res.ok) {
      const body = (await res.json()) as { links: AdminLinkView[] }
      setLinks(body.links)
    }
  }

  const handleDelete = async (linkId: string) => {
    if (!confirm('Delete this onboarding link?')) return
    await fetch(`/api/admin/links/${linkId}`, { method: 'DELETE' })
    await refresh()
  }

  const handleLogout = async () => {
    await fetch('/auth/logout', { method: 'POST' })
    navigate({ to: '/' })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-8">
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={config.theme.agencyLogoUrl} alt={config.theme.agencyName} className="size-8" />
          <span className="text-sm font-medium">{config.theme.agencyName}</span>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/admin/config">
            <Button variant="ghost" size="sm">
              Configure
            </Button>
          </Link>
          <form onSubmit={(e) => { e.preventDefault(); void handleLogout() }}>
            <Button type="submit" variant="ghost" size="sm">
              Log out
            </Button>
          </form>
        </div>
      </header>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding links</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Each link routes a client through your onboarding flow into a Sapt project.
          </p>
        </div>
        <Button onClick={() => setShowMint(true)}>New link</Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {links === null ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-dashed px-4 py-12 text-center">
          <p className="text-muted-foreground text-sm">No links yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {links.map((link) => (
            <LinkRow
              key={link.id}
              link={link}
              projectName={projects?.find((p) => p.id === link.projectId)?.name ?? link.projectId}
              onDelete={() => handleDelete(link.id)}
            />
          ))}
        </div>
      )}

      {showMint && projects && (
        <MintLinkDialog
          projects={projects}
          onClose={() => setShowMint(false)}
          onCreated={async () => {
            setShowMint(false)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

function LinkRow({
  link,
  projectName,
  onDelete,
}: {
  link: AdminLinkView
  projectName: string
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(link.shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-card flex items-center gap-4 rounded-xl border px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{projectName}</span>
          <Badge variant={link.status === 'completed' ? 'secondary' : 'outline'}>
            {link.status}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 truncate text-xs">{link.shareUrl}</p>
      </div>
      <Button size="sm" variant="outline" onClick={copy}>
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDelete}>
        Delete
      </Button>
    </div>
  )
}

function MintLinkDialog({
  projects,
  onClose,
  onCreated,
}: {
  projects: SaptProject[]
  onClose: () => void
  onCreated: () => void
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!projectId) {
      setError('Pick a project')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/admin/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
      setError(body?.error?.message ?? 'Failed to create link')
      setSubmitting(false)
      return
    }
    await onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="bg-background w-full max-w-md rounded-xl border p-6 shadow-lg">
        <h2 className="text-lg font-semibold">New onboarding link</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick the Sapt project the client&apos;s onboarding will write into.
        </p>

        <div className="mt-6">
          <label className="text-sm font-medium" htmlFor="project-select">
            Project
          </label>
          <select
            id="project-select"
            className="border-input bg-background mt-2 h-10 w-full rounded-md border px-3 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-destructive mt-3 text-sm">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={submitting || !projectId}>
            {submitting ? 'Creating…' : 'Create link'}
          </Button>
        </div>
      </div>
    </div>
  )
}
