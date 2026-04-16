'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Sparkles, Loader2, Download,
  Layers, ChevronRight, Check, Save, Cloud, FileText, Pencil, Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StoryboardTableView } from '@/components/storyboard-table-view'
import type { Project, Episode, StoryboardEntry } from '@/lib/types'
import { buildStoryboardDocxBlob, sanitizeFilenameBase } from '@/lib/export-storyboard-docx'
import { toast } from 'sonner'

interface ProjectDetailProps {
  project: Project
  onUpdate: (project: Project) => void
  onEditProject: () => void
}

function formatSavedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ProjectDetail({ project, onUpdate, onEditProject }: ProjectDetailProps) {
  const [activeEpisode, setActiveEpisode] = useState(0)

  useEffect(() => {
    setActiveEpisode((i) =>
      project.episodes.length === 0 ? 0 : Math.min(i, project.episodes.length - 1)
    )
  }, [project.episodes.length, project.id])
  const [generatingEp, setGeneratingEp] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [exportingWord, setExportingWord] = useState(false)

  const currentEp = project.episodes[activeEpisode]

  const handleSaveProject = useCallback(async () => {
    setSavingAll(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episodes: project.episodes,
          status: project.status,
        }),
      })
      if (!res.ok) throw new Error('保存失败')
      const updated: Project = await res.json()
      onUpdate(updated)
      toast.success('已保存到云端，换设备登录同一账号可同步查看')
    } catch {
      toast.error('保存失败，请重试')
    } finally {
      setSavingAll(false)
    }
  }, [project, onUpdate])

  const handleGenerate = useCallback(
    async (episode: Episode) => {
      setGeneratingEp(episode.id)
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            episodeId: episode.id,
            episodeNumber: episode.episodeNumber,
            totalEpisodes: project.totalEpisodes,
            projectTitle: project.title,
            genre: project.genre,
            visualStyle: project.visualStyle,
            storyline: project.storyline,
            episodeMinMinutes: project.episodeMinMinutes,
            episodeMaxMinutes: project.episodeMaxMinutes,
            characters: project.characters,
          }),
        })

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || '生成失败');
        }

        const data = await res.json();

        if (data?.storyboard) {
          const storyboardWithIds: StoryboardEntry[] = data.storyboard.map(
            (entry: Omit<StoryboardEntry, 'id'>, index: number) => ({
              ...entry,
              id: crypto.randomUUID(),
              sceneNumber: index + 1,
              aiVideoPrompt: entry.aiVideoPrompt || '',
              voiceOver: entry.voiceOver || '',
              colorTone: entry.colorTone || '',
            })
          )

          const updatedEpisodes = project.episodes.map((ep) =>
            ep.id === episode.id
              ? {
                  ...ep,
                  title: data.episodeTitle || ep.title,
                  synopsis: data.episodeSynopsis || ep.synopsis,
                  storyboard: storyboardWithIds,
                  status: '已完成' as const,
                }
              : ep
          )

          const allDone = updatedEpisodes.every((ep) => ep.status === '已完成')

          const updated: Project = {
            ...project,
            episodes: updatedEpisodes,
            status: allDone ? '已完成' : project.status,
            updatedAt: new Date().toISOString(),
          }

          const patchRes = await fetch(`/api/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ episodes: updatedEpisodes, status: updated.status }),
          })
          if (!patchRes.ok) {
            const errBody = await patchRes.json().catch(() => ({}))
            throw new Error(
              typeof errBody.error === 'string' ? errBody.error : '分镜已生成但保存到云端失败，请点击「保存项目」重试'
            )
          }
          const savedAfterGen: Project = await patchRes.json()
          onUpdate(savedAfterGen)
          toast.success(`第 ${episode.episodeNumber} 集分镜已生成并保存到云端`)
        } else {
          throw new Error('响应数据格式错误');
        }
      } catch (error) {
        console.error('Generation error:', error)
        const errorMessage = error instanceof Error ? error.message : '生成失败，请重试';
        toast.error(errorMessage)
      } finally {
        setGeneratingEp(null)
      }
    },
    [project, onUpdate]
  )

  const handleStoryboardUpdate = useCallback(
    async (entries: StoryboardEntry[]) => {
      if (!currentEp) return
      const updatedEpisodes = project.episodes.map((ep) =>
        ep.id === currentEp.id ? { ...ep, storyboard: entries } : ep
      )
      const optimistic = { ...project, episodes: updatedEpisodes, updatedAt: new Date().toISOString() }
      onUpdate(optimistic)
      try {
        const res = await fetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodes: updatedEpisodes }),
        })
        if (res.ok) {
          const saved: Project = await res.json()
          onUpdate(saved)
        } else {
          toast.error('自动保存失败，请点「保存项目」重试')
        }
      } catch {
        toast.error('网络异常，请点「保存项目」重试')
      }
    },
    [project, currentEp, onUpdate]
  )

  const handleExport = useCallback(() => {
    // 创建 CSV 格式的表格数据
    let csvContent = '\uFEFF' // UTF-8 BOM for Excel
    
    // 添加项目信息
    csvContent += `短剧分镜脚本表格\n`
    csvContent += `项目标题,${project.title}\n`
    csvContent += `剧本类型,${project.genre}\n`
    csvContent += `视觉风格,${project.visualStyle}\n`
    csvContent += `总集数,${project.totalEpisodes}\n\n`

    project.episodes.forEach((ep) => {
      if (ep.storyboard.length === 0) return
      
      csvContent += `\n第 ${ep.episodeNumber} 集: ${ep.title}\n`
      if (ep.synopsis) {
        csvContent += `剧情简介,${ep.synopsis}\n`
      }
      csvContent += `\n`
      
      // 表格标题行
      csvContent += `场景号,场景描述,镜头运动,对话内容,出场角色,画外音,画面色调,时长,情绪,视频拍摄提示词\n`
      
      // 数据行
      ep.storyboard.forEach((s) => {
        const row = [
          s.sceneNumber,
          `"${s.sceneDescription.replace(/"/g, '""')}"`,
          s.cameraMovement,
          `"${s.dialogue.replace(/"/g, '""')}"`,
          s.characterInScene,
          s.voiceOver || '',
          s.colorTone || '',
          s.duration,
          s.mood,
          `"${(s.aiVideoPrompt || '').replace(/"/g, '""')}"`,
        ]
        csvContent += row.join(',') + '\n'
      })
      
      csvContent += `\n`
    })

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.title}_全集分镜表格.csv`
    a.click()
    URL.revokeObjectURL(url)
    
    toast.success('分镜表格已导出为 CSV 文件')
  }, [project])

  const handleExportWord = useCallback(async () => {
    setExportingWord(true)
    try {
      const blob = await buildStoryboardDocxBlob(project)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilenameBase(project.title)}_分镜脚本.docx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出横版 Word，表格宽度随页面自动适配')
    } catch (e) {
      console.error(e)
      toast.error('导出 Word 失败，请重试')
    } finally {
      setExportingWord(false)
    }
  }, [project])

  const completedCount = project.episodes.filter((ep) => ep.status === '已完成').length
  const totalScenes = project.episodes.reduce((a, ep) => a + ep.storyboard.length, 0)

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gradient-to-br from-background via-background to-muted/20">
      {/* Left sidebar - Episode list */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border/50 bg-card/40 backdrop-blur-sm">
        {/* Project summary */}
        <div className="border-b border-border/50 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-semibold leading-tight text-foreground">{project.title}</h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={onEditProject}
            >
              <Pencil className="h-3 w-3" />
              编辑
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5 py-0">
              {project.genre}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {project.visualStyle}
            </Badge>
            {project.scriptFile?.name && (
              <a
                href={project.scriptFile.url || '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0 text-[10px] text-primary hover:bg-accent"
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{project.scriptFile.name}</span>
              </a>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-secondary/50 px-1 py-1.5">
              <p className="text-sm font-semibold text-primary">{project.totalEpisodes}</p>
              <p className="text-[9px] text-muted-foreground">总集数</p>
            </div>
            <div className="rounded-md bg-secondary/50 px-1 py-1.5">
              <p className="text-sm font-semibold text-foreground">{completedCount}</p>
              <p className="text-[9px] text-muted-foreground">已完成</p>
            </div>
            <div className="rounded-md bg-secondary/50 px-1 py-1.5">
              <p className="text-sm font-semibold text-foreground">{totalScenes}</p>
              <p className="text-[9px] text-muted-foreground">分镜数</p>
            </div>
          </div>
        </div>

        {/* Episode list */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-2">
              <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                剧集列表
              </p>
              {project.episodes.map((ep, idx) => {
                const isActive = idx === activeEpisode
                const isGenerating = generatingEp === ep.id
                const isDone = ep.status === '已完成'

                return (
                  <button
                    key={ep.id}
                    onClick={() => setActiveEpisode(idx)}
                    className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isActive
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold ${
                      isDone
                        ? 'bg-emerald-900/40 text-emerald-400'
                        : isActive
                          ? 'bg-primary/20 text-primary'
                          : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {isDone ? <Check className="h-3 w-3" /> : ep.episodeNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">第 {ep.episodeNumber} 集</p>
                    {ep.title !== `第 ${ep.episodeNumber} 集` && (
                      <p className="truncate text-[10px] text-muted-foreground">{ep.title}</p>
                    )}
                  </div>
                  {isGenerating && (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                  )}
                  {!isGenerating && ep.storyboard.length > 0 && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {ep.storyboard.length}
                    </span>
                  )}
                </button>
              )
            })}
            </div>
          </ScrollArea>
        </div>

        {/* Bottom actions */}
        <div className="space-y-2 border-t border-border/50 p-3">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs font-medium"
            onClick={handleSaveProject}
            disabled={savingAll}
          >
            {savingAll ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            保存项目
          </Button>
          <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
            <Cloud className="mt-0.5 h-3 w-3 shrink-0" />
            编辑分镜后会自动保存到 Supabase 云端（剧集与分镜表）。换浏览器或设备登录同一账号即可继续编辑。
          </p>
          <Button
            variant="default"
            size="sm"
            className="w-full gap-1.5 text-xs font-medium"
            onClick={handleExportWord}
            disabled={totalScenes === 0 || exportingWord}
          >
            {exportingWord ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileText className="h-3 w-3" />
            )}
            导出 Word（横版）
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={handleExport}
            disabled={totalScenes === 0}
          >
            <Download className="h-3 w-3" />
            导出 CSV
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {currentEp ? (
          <>
            {/* Episode header */}
            <div className="flex flex-col gap-3 border-b border-border/50 bg-card/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Layers className="h-4 w-4 shrink-0 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">
                    第 {currentEp.episodeNumber} 集
                  </h3>
                  {currentEp.title !== `第 ${currentEp.episodeNumber} 集` && (
                    <>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                      <span className="truncate text-sm text-muted-foreground">{currentEp.title}</span>
                    </>
                  )}
                  {currentEp.status === '已完成' && (
                    <Badge className="border-emerald-800/40 bg-emerald-900/30 px-1.5 py-0 text-[10px] text-emerald-400">
                      已完成
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    每集 {project.episodeMinMinutes}-{project.episodeMaxMinutes} 分钟
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  上次保存：{formatSavedAt(project.updatedAt)}
                </p>
              </div>
              <Button
                size="sm"
                className="shrink-0 gap-1.5 text-xs font-medium"
                onClick={() => handleGenerate(currentEp)}
                disabled={generatingEp === currentEp.id}
              >
                {generatingEp === currentEp.id ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AI 生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3" />
                    {currentEp.storyboard.length > 0 ? '重新生成分镜' : '生成本集分镜'}
                  </>
                )}
              </Button>
            </div>

            {/* Episode synopsis */}
            {currentEp.synopsis && (
              <div className="border-b border-border/40 bg-muted/15 px-6 py-3">
                <p className="text-xs font-medium text-muted-foreground">本集简介</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/85">{currentEp.synopsis}</p>
              </div>
            )}

            {/* Storyboard content */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
                  <StoryboardTableView
                    entries={currentEp.storyboard}
                    onUpdate={handleStoryboardUpdate}
                  />
                </div>
              </ScrollArea>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">请选择一个剧集</p>
          </div>
        )}
      </main>
    </div>
  )
}
