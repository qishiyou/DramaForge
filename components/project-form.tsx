'use client'

import { useState } from 'react'
import { Trash2, UserPlus, Clapperboard, Sparkles, Wand2, Loader2 } from 'lucide-react'
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
import type { Character, Genre, VisualStyle } from '@/lib/types'
import { assignCharacterIds } from '@/lib/normalize-ai-characters'
import { toast } from 'sonner'

interface ProjectFormProps {
  onSubmit: (data: {
    title: string
    genre: Genre
    visualStyle: VisualStyle
    storyline: string
    totalEpisodes: number
    episodeMinMinutes: number
    episodeMaxMinutes: number
    characters: Character[]
  }) => void
  onCancel: () => void
  isLoading?: boolean
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

export function ProjectForm({ onSubmit, onCancel, isLoading }: ProjectFormProps) {
  const durationOptions = [0.5, 1, 1.5, 2, 2.5, 3]
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState<Genre>('复仇')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('真人实拍')
  const [storyline, setStoryline] = useState('')
  const [totalEpisodes, setTotalEpisodes] = useState(3)
  const [episodeMinMinutes, setEpisodeMinMinutes] = useState(1)
  const [episodeMaxMinutes, setEpisodeMaxMinutes] = useState(1.5)
  const [characters, setCharacters] = useState<Character[]>([createEmptyCharacter()])
  const [extracting, setExtracting] = useState(false)

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
      const drafts = data.characters as Omit<Character, 'id'>[] | undefined
      if (!Array.isArray(drafts) || drafts.length === 0) {
        toast.error('未返回有效角色列表')
        return
      }
      setCharacters(assignCharacterIds(drafts))
      toast.success(`已根据梗概生成 ${drafts.length} 个角色，可继续微调`)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const safeMin = Math.min(episodeMinMinutes, episodeMaxMinutes)
    const safeMax = Math.max(episodeMinMinutes, episodeMaxMinutes)
    onSubmit({
      title,
      genre,
      visualStyle,
      storyline,
      totalEpisodes,
      episodeMinMinutes: safeMin,
      episodeMaxMinutes: safeMax,
      characters,
    })
  }

  return (
    <ScrollArea className="h-[calc(100vh-64px)]">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl px-6 py-8">
        {/* Title area */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
              <Clapperboard className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">创建新项目</h2>
              <p className="text-xs text-muted-foreground">
                填写短剧信息，AI 将为每集生成完整分镜
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Basic */}
        <section className="mb-6">
          <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            基本信息
          </h3>
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="title" className="text-xs text-muted-foreground">短剧标题</Label>
                <Input
                  id="title"
                  placeholder="例如：逆袭之路、月下情缘..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="border-border/60 bg-secondary/50 text-sm placeholder:text-muted-foreground/50"
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
                        <SelectItem key={`min-${n}`} value={String(n)}>
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
                        <SelectItem key={`max-${n}`} value={String(n)}>
                          {n} 分钟
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  例如 1-1.5 分钟；生成分镜时会按该区间约束单集总时长。
                </p>
              </div>

              <div className="grid gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="storyline" className="text-xs text-muted-foreground">
                    故事梗概
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs shrink-0"
                    disabled={extracting || isLoading}
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
                  id="storyline"
                  placeholder="请详细描述核心冲突、故事背景、关键转折点与主要人物关系…写完后可点上方按钮自动生成角色卡"
                  rows={4}
                  value={storyline}
                  onChange={(e) => setStoryline(e.target.value)}
                  required
                  className="border-border/60 bg-secondary/50 text-sm resize-none placeholder:text-muted-foreground/50"
                />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  将根据梗概识别主要角色并填充姓名、定位、性格与外貌等字段；你可随时手动增删改。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Characters */}
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
              <div
                key={char.id}
                className="rounded-xl border border-border/60 bg-card p-4"
              >
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
                        placeholder="姓名"
                        value={char.name}
                        onChange={(e) => updateCharacter(char.id, 'name', e.target.value)}
                        required
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">年龄</Label>
                      <Input
                        placeholder="25岁"
                        value={char.age}
                        onChange={(e) => updateCharacter(char.id, 'age', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">身高</Label>
                      <Input
                        placeholder="175cm"
                        value={char.height}
                        onChange={(e) => updateCharacter(char.id, 'height', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">角色定位</Label>
                      <Input
                        placeholder="男主角"
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
                        placeholder="外冷内热、聪明果断..."
                        value={char.personality}
                        onChange={(e) => updateCharacter(char.id, 'personality', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">外貌关键词</Label>
                      <Input
                        placeholder="一句话概括，如：短发利落、冷峻气质"
                        value={char.appearance}
                        onChange={(e) => updateCharacter(char.id, 'appearance', e.target.value)}
                        className="h-8 border-border/60 bg-secondary/50 text-xs"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">外貌详细描述</Label>
                      <Textarea
                        placeholder="详细写出脸型、发型与发色、五官特点、肤色、体型、日常着装风格、配饰或伤疤等标志性特征，便于分镜与视频提示词保持一致。"
                        value={char.appearanceDetail ?? ''}
                        onChange={(e) => updateCharacter(char.id, 'appearanceDetail', e.target.value)}
                        rows={4}
                        className="min-h-[88px] resize-y border-border/60 bg-secondary/50 text-xs leading-relaxed placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="text-sm text-muted-foreground"
          >
            取消
          </Button>
          <Button type="submit" disabled={isLoading} className="gap-1.5 text-sm font-medium">
            {isLoading ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                创建中...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                创建项目
              </>
            )}
          </Button>
        </div>
      </form>
    </ScrollArea>
  )
}
