'use client'

import { useState } from 'react'
import { Trash2, UserPlus, Pencil, Loader2, Wand2, Upload, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GenreSelector } from '@/components/genre-selector'
import { VisualStyleSelector } from '@/components/visual-style-selector'
import type { Character, Genre, VisualStyle, Project, ScriptFileMeta } from '@/lib/types'
import { adjustEpisodesForTotalCount } from '@/lib/adjust-episodes'
import { assignCharacterIds } from '@/lib/normalize-ai-characters'
import { toast } from 'sonner'

interface ProjectEditFormProps {
  project: Project
  onSaved: (project: Project) => void
  onCancel: () => void
}

function createEmptyCharacter(): Character {
  return {
    id: crypto.randomUUID(),
    name: '',
    age: '',
    height: '',
    personality: '',
    appearance: '',
    appearanceDetail: '',
    role: '',
  }
}

function normalizeCharacter(c: Character): Character {
  return {
    ...c,
    appearanceDetail: c.appearanceDetail ?? '',
  }
}

export function ProjectEditForm({ project, onSaved, onCancel }: ProjectEditFormProps) {
  const durationOptions = [0.5, 1, 1.5, 2, 2.5, 3]
  const [title, setTitle] = useState(project.title)
  const [genre, setGenre] = useState<Genre>(project.genre)
  const [visualStyle, setVisualStyle] = useState<VisualStyle>(project.visualStyle)
  const [storyline, setStoryline] = useState(project.storyline)
  const [totalEpisodes, setTotalEpisodes] = useState(
    project.episodes.length > 0 ? project.episodes.length : project.totalEpisodes
  )
  const [episodeMinMinutes, setEpisodeMinMinutes] = useState(project.episodeMinMinutes ?? 1)
  const [episodeMaxMinutes, setEpisodeMaxMinutes] = useState(project.episodeMaxMinutes ?? 1.5)
  const [scriptFile, setScriptFile] = useState<ScriptFileMeta | null>(project.scriptFile ?? null)
  const [characters, setCharacters] = useState<Character[]>(() =>
    project.characters.length > 0
      ? project.characters.map(normalizeCharacter)
      : [createEmptyCharacter()]
  )
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [uploadingScript, setUploadingScript] = useState(false)

  const extractCharactersFromStoryline = async () => {
    const t = storyline.trim()
    if (t.length < 24) {
      toast.error('请先填写更完整的故事梗概（至少约 24 字），便于识别角色')
      return
    }
    setExtracting(true)
    try {
      const res = await fetch('/api/ai/extract-characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyline: t,
          title: title.trim() || undefined,
          genre,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : '提取失败')
        return
      }
      const list = data.characters as Omit<Character, 'id'>[] | undefined
      if (!Array.isArray(list) || list.length === 0) {
        toast.error('未返回有效角色列表')
        return
      }
      setCharacters(assignCharacterIds(list))
      toast.success(`已根据梗概生成 ${list.length} 个角色，可继续微调`)
    } catch {
      toast.error('网络异常，请重试')
    } finally {
      setExtracting(false)
    }
  }

  const addCharacter = () => setCharacters((prev) => [...prev, createEmptyCharacter()])

  const removeCharacter = (id: string) => {
    if (characters.length <= 1) return
    setCharacters((prev) => prev.filter((c) => c.id !== id))
  }

  const updateCharacter = (id: string, field: keyof Character, value: string) => {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (totalEpisodes < project.episodes.length) {
      const removed = project.episodes.slice(totalEpisodes)
      const hasStory = removed.some((ep) => ep.storyboard.length > 0 || (ep.synopsis || '').trim() !== '')
      if (hasStory) {
        const ok = window.confirm(
          '减少集数将删除末尾剧集及其分镜、简介等数据，此操作不可撤销。确定继续吗？'
        )
        if (!ok) return
      }
    }

    setSaving(true)
    try {
      const nextEpisodes = adjustEpisodesForTotalCount(project.episodes, totalEpisodes)
      const safeMin = Math.min(episodeMinMinutes, episodeMaxMinutes)
      const safeMax = Math.max(episodeMinMinutes, episodeMaxMinutes)
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          genre,
          visualStyle,
          storyline,
          totalEpisodes,
          episodeMinMinutes: safeMin,
          episodeMaxMinutes: safeMax,
          scriptFile,
          characters,
          episodes: nextEpisodes,
        }),
      })
      if (!res.ok) throw new Error('保存失败')
      const updated: Project = await res.json()
      onSaved(updated)
      toast.success('项目已更新')
    } catch {
      toast.error('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const handleScriptUpload = async (file: File) => {
    setUploadingScript(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/uploads/script', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : '上传失败')
        return
      }
      setScriptFile(data as ScriptFileMeta)
      toast.success('剧本文档上传成功')
    } catch {
      toast.error('上传失败，请重试')
    } finally {
      setUploadingScript(false)
    }
  }

  return (
    <ScrollArea className="h-[calc(100vh-64px)]">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Pencil className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">编辑项目</h2>
              <p className="text-xs text-muted-foreground">
                修改基本信息与角色；调整集数会增删对应剧集（减少时末尾集及其分镜将被删除）
              </p>
            </div>
          </div>
        </div>

        <section className="mb-6">
          <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            基本信息
          </h3>
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="edit-title" className="text-xs text-muted-foreground">
                  短剧标题
                </Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="border-border/60 bg-secondary/50 text-sm"
                />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">剧本类型</Label>
                <GenreSelector value={genre} onChange={setGenre} />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">视觉风格</Label>
                <VisualStyleSelector value={visualStyle} onChange={setVisualStyle} />
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">剧集数量</Label>
                <Select
                  value={String(totalEpisodes)}
                  onValueChange={(v) => setTotalEpisodes(Number(v))}
                >
                  <SelectTrigger className="border-border/60 bg-secondary/50 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 100 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} 集
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">每集时长范围（分钟）</Label>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <Select
                    value={String(episodeMinMinutes)}
                    onValueChange={(v) => setEpisodeMinMinutes(Number(v))}
                  >
                    <SelectTrigger className="border-border/60 bg-secondary/50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((n) => (
                        <SelectItem key={`edit-min-${n}`} value={String(n)}>
                          {n} 分钟
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">至</span>
                  <Select
                    value={String(episodeMaxMinutes)}
                    onValueChange={(v) => setEpisodeMaxMinutes(Number(v))}
                  >
                    <SelectTrigger className="border-border/60 bg-secondary/50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((n) => (
                        <SelectItem key={`edit-max-${n}`} value={String(n)}>
                          {n} 分钟
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  例如 1-1.5 分钟；重新生成分镜时会按该区间约束。
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">剧本文档（可选）</Label>
                <div className="rounded-lg border border-border/60 bg-secondary/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label
                      htmlFor="edit-script-upload"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs hover:bg-accent"
                    >
                      {uploadingScript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      上传文档
                    </Label>
                    <Input
                      id="edit-script-upload"
                      type="file"
                      accept=".doc,.docx,.md,.markdown,.txt,.pdf"
                      className="hidden"
                      disabled={uploadingScript || saving}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleScriptUpload(f)
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">支持 Word / MD / TXT / PDF，最大 20MB</span>
                  </div>
                  {scriptFile && (
                    <div className="mt-2 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <a
                        href={scriptFile.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-primary hover:underline"
                      >
                        {scriptFile.name}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="edit-storyline" className="text-xs text-muted-foreground">
                    故事梗概
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs shrink-0"
                    disabled={extracting || saving}
                    onClick={extractCharactersFromStoryline}
                  >
                    {extracting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    从梗概提取角色
                  </Button>
                </div>
                <Textarea
                  id="edit-storyline"
                  rows={4}
                  value={storyline}
                  onChange={(e) => setStoryline(e.target.value)}
                  required
                  className="border-border/60 bg-secondary/50 text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  修改梗概后可一键重新提取角色（将覆盖当前角色列表，保存前请确认）。
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              角色设定
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-primary hover:text-primary"
              onClick={addCharacter}
            >
              <UserPlus className="h-3 w-3" />
              添加角色
            </Button>
          </div>
          <div className="grid gap-3">
            {characters.map((char, index) => (
              <div key={char.id} className="rounded-xl border border-border/60 bg-card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {index + 1}
                    </div>
                    <span className="text-xs font-medium text-foreground">
                      {char.name || `角色 ${index + 1}`}
                    </span>
                  </div>
                  {characters.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeCharacter(char.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2.5">
                  <div className="grid grid-cols-4 gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">角色名</Label>
                      <Input
                        value={char.name}
                        onChange={(e) => updateCharacter(char.id, 'name', e.target.value)}
                        required
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">年龄</Label>
                      <Input
                        value={char.age}
                        onChange={(e) => updateCharacter(char.id, 'age', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">身高</Label>
                      <Input
                        value={char.height}
                        onChange={(e) => updateCharacter(char.id, 'height', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">角色定位</Label>
                      <Input
                        value={char.role}
                        onChange={(e) => updateCharacter(char.id, 'role', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">性格特征</Label>
                      <Input
                        value={char.personality}
                        onChange={(e) => updateCharacter(char.id, 'personality', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">外貌关键词</Label>
                      <Input
                        value={char.appearance}
                        onChange={(e) => updateCharacter(char.id, 'appearance', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">外貌详细描述</Label>
                      <Textarea
                        value={char.appearanceDetail ?? ''}
                        onChange={(e) => updateCharacter(char.id, 'appearanceDetail', e.target.value)}
                        rows={4}
                        className="min-h-[88px] resize-y border-border/60 bg-secondary/50 text-xs leading-relaxed"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-6">
          <Button type="button" variant="ghost" onClick={onCancel} className="text-sm text-muted-foreground">
            取消
          </Button>
          <Button type="submit" disabled={saving} className="gap-1.5 text-sm font-medium">
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                保存中…
              </>
            ) : (
              '保存更改'
            )}
          </Button>
        </div>
      </form>
    </ScrollArea>
  )
}
