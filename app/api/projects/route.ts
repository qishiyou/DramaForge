import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { ensureProfileForUser } from '@/lib/supabase/ensure-profile'
import { createProjectForUser, fetchProjectsForUser } from '@/lib/supabase/project-service'
import type { Episode, ScriptFileMeta } from '@/lib/types'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return '服务器错误'
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError('未登录', 401)

    const projects = await fetchProjectsForUser(supabase, user.id)
    return NextResponse.json(projects)
  } catch (e) {
    console.error('[GET /api/projects]', e)
    return jsonError(serializeError(e), 500)
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError('未登录', 401)

    await ensureProfileForUser(supabase, user)

    const body = await req.json()
    const totalEpisodes = Number(body.totalEpisodes) || 1
    const episodeMinMinutes = Math.max(0.5, Number(body.episodeMinMinutes) || 1)
    const episodeMaxMinutes = Math.max(episodeMinMinutes, Number(body.episodeMaxMinutes) || 1.5)
    const scriptFile =
      body.scriptFile && typeof body.scriptFile === 'object'
        ? (body.scriptFile as ScriptFileMeta)
        : null

    const episodes: Episode[] = Array.from({ length: totalEpisodes }, (_, i) => ({
      id: crypto.randomUUID(),
      episodeNumber: i + 1,
      title: `第 ${i + 1} 集`,
      synopsis: '',
      storyboard: [],
      status: '草稿' as const,
    }))

    const project = await createProjectForUser(supabase, user.id, {
      title: body.title,
      genre: body.genre,
      visual_style: body.visualStyle,
      storyline: body.storyline,
      total_episodes: totalEpisodes,
      episode_min_minutes: episodeMinMinutes,
      episode_max_minutes: episodeMaxMinutes,
      script_file: scriptFile,
      characters: body.characters ?? [],
      episodes,
    })

    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    console.error('[POST /api/projects]', e)
    return jsonError(serializeError(e), 500)
  }
}
