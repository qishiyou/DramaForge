'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { AppHeader } from '@/components/app-header'
import { ProjectDashboard } from '@/components/project-dashboard'
import { ProjectForm } from '@/components/project-form'
import { ProjectEditForm } from '@/components/project-edit-form'
import { ProjectDetail } from '@/components/project-detail'
import { SupabaseConfigWarning } from '@/components/supabase-config-warning'
import { useAuth } from '@/lib/supabase/auth-context'
import type { Project, Genre, VisualStyle, Character } from '@/lib/types'
import { toast } from 'sonner'

type View = 'dashboard' | 'create' | 'detail' | 'edit'

/** 非 2xx 时抛出，避免 SWR 把 { error: string } 当成 Project[] 导致 .filter 崩溃 */
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  let json: unknown
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && json !== null && 'error' in json
        ? String((json as { error: unknown }).error)
        : res.statusText
    const err = new Error(msg || `HTTP ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return json as T
}

export function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlProjectId = searchParams.get('p')
  const urlEdit = searchParams.get('edit') === '1'

  const authContext = useAuth()
  const { user, loading: authLoading, signOut } = authContext
  const isConfigured = useMemo(() => authContext.isConfigured, [authContext.isConfigured])
  const [view, setView] = useState<View>('dashboard')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [mounted, setMounted] = useState(false)

  const needsUrlHydration = Boolean(urlProjectId)
  const [urlReady, setUrlReady] = useState(!needsUrlHydration)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !authLoading && !user && isConfigured) {
      router.push('/auth')
    }
  }, [mounted, authLoading, user, isConfigured, router])

  const { data: projectsData, error: projectsError, mutate } = useSWR<Project[]>(
    user && isConfigured ? '/api/projects' : null,
    fetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
    }
  )

  const projects = Array.isArray(projectsData) ? projectsData : []

  useEffect(() => {
    const status = projectsError && typeof projectsError === 'object' && 'status' in projectsError
      ? (projectsError as Error & { status: number }).status
      : undefined
    if (status === 401) {
      toast.error('登录已失效，请重新登录')
      void signOut().then(() => router.replace('/auth'))
    }
  }, [projectsError, signOut, router])

  useEffect(() => {
    if (!needsUrlHydration) {
      setUrlReady(true)
      return
    }
    if (!mounted || authLoading || !user || !isConfigured) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${urlProjectId}`)
        if (cancelled) return
        if (res.ok) {
          const p: Project = await res.json()
          setSelectedProject(p)
          setView(urlEdit ? 'edit' : 'detail')
        } else {
          toast.error('项目不存在或已删除')
          router.replace('/', { scroll: false })
        }
      } catch {
        if (!cancelled) {
          toast.error('加载项目失败')
          router.replace('/', { scroll: false })
        }
      } finally {
        if (!cancelled) setUrlReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [needsUrlHydration, urlProjectId, urlEdit, mounted, authLoading, user, isConfigured, router])

  const handleNewProject = useCallback(() => {
    setView('create')
    router.replace('/', { scroll: false })
  }, [router])

  const handleCancel = useCallback(() => {
    setView('dashboard')
    router.replace('/', { scroll: false })
  }, [router])

  const handleSelectProject = useCallback(
    async (project: Project) => {
      try {
        const res = await fetch(`/api/projects/${project.id}`)
        const p: Project = res.ok ? await res.json() : project
        setSelectedProject(p)
        setView('detail')
        router.replace(`/?p=${p.id}`, { scroll: false })
      } catch {
        setSelectedProject(project)
        setView('detail')
        router.replace(`/?p=${project.id}`, { scroll: false })
      }
    },
    [router]
  )

  const handleCreateProject = useCallback(
    async (data: {
      title: string
      genre: Genre
      visualStyle: VisualStyle
      storyline: string
      totalEpisodes: number
      characters: Character[]
    }) => {
      setCreating(true)
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        if (!res.ok) throw new Error('创建失败')
        const newProject: Project = await res.json()
        await mutate()
        setSelectedProject(newProject)
        setView('detail')
        router.replace(`/?p=${newProject.id}`, { scroll: false })
        toast.success('项目已保存并打开')
      } catch {
        toast.error('创建项目失败，请重试')
      } finally {
        setCreating(false)
      }
    },
    [mutate, router]
  )

  const handleDeleteProject = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/projects/${id}`, { method: 'DELETE' })
        await mutate()
        if (selectedProject?.id === id) {
          setSelectedProject(null)
          setView('dashboard')
          router.replace('/', { scroll: false })
        }
        toast.success('项目已删除')
      } catch {
        toast.error('删除失败')
      }
    },
    [mutate, selectedProject, router]
  )

  const handleProjectUpdate = useCallback(
    async (updated: Project) => {
      setSelectedProject(updated)
      await mutate()
    },
    [mutate]
  )

  const handleBack = useCallback(() => {
    if (view === 'edit' && selectedProject) {
      setView('detail')
      router.replace(`/?p=${selectedProject.id}`, { scroll: false })
      return
    }
    setView('dashboard')
    setSelectedProject(null)
    router.replace('/', { scroll: false })
  }, [view, selectedProject, router])

  const handleOpenProjectEdit = useCallback(() => {
    if (!selectedProject) return
    setView('edit')
    router.replace(`/?p=${selectedProject.id}&edit=1`, { scroll: false })
  }, [selectedProject, router])

  const handleProjectEditSaved = useCallback(
    (updated: Project) => {
      setSelectedProject(updated)
      mutate()
      setView('detail')
      router.replace(`/?p=${updated.id}`, { scroll: false })
    },
    [mutate, router]
  )

  const handleCancelProjectEdit = useCallback(() => {
    if (!selectedProject) return
    setView('detail')
    router.replace(`/?p=${selectedProject.id}`, { scroll: false })
  }, [selectedProject, router])

  if (!mounted || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isConfigured) {
    return <SupabaseConfigWarning />
  }

  if (!user) {
    return null
  }

  if (!urlReady) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">正在加载项目…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <AppHeader
        onNewProject={handleNewProject}
        showBack={view !== 'dashboard'}
        onBack={handleBack}
        title={
          view === 'edit' && selectedProject
            ? `编辑 · ${selectedProject.title}`
            : view === 'detail' && selectedProject
              ? selectedProject.title
              : undefined
        }
      />
      <main className="flex-1 overflow-hidden">
        {view === 'dashboard' && (
          <ProjectDashboard
            projects={projects}
            onSelect={handleSelectProject}
            onDelete={handleDeleteProject}
            onNewProject={handleNewProject}
          />
        )}
        {view === 'create' && (
          <ProjectForm
            onSubmit={handleCreateProject}
            onCancel={handleCancel}
            isLoading={creating}
          />
        )}
        {view === 'edit' && selectedProject && (
          <ProjectEditForm
            key={selectedProject.id}
            project={selectedProject}
            onSaved={handleProjectEditSaved}
            onCancel={handleCancelProjectEdit}
          />
        )}
        {view === 'detail' && selectedProject && (
          <ProjectDetail
            project={selectedProject}
            onUpdate={handleProjectUpdate}
            onEditProject={handleOpenProjectEdit}
          />
        )}
      </main>
    </div>
  )
}
