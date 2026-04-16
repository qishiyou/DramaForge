import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  deleteProjectForUser,
  fetchProjectById,
  updateProjectForUser,
  type ProjectUpdateInput,
} from '@/lib/supabase/project-service'
import type { Character, Episode, ScriptFileMeta } from '@/lib/types'

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/** 将前端 camelCase 请求体转为 project-service 使用的字段名 */
function bodyToPatch(body: Record<string, unknown>): ProjectUpdateInput {
  const patch: ProjectUpdateInput = {}
  if (body.title !== undefined) patch.title = body.title as string
  if (body.genre !== undefined) patch.genre = body.genre as string
  if (body.visualStyle !== undefined) patch.visual_style = body.visualStyle as string
  if (body.storyline !== undefined) patch.storyline = body.storyline as string
  if (body.totalEpisodes !== undefined) patch.total_episodes = Number(body.totalEpisodes)
  if (body.episodeMinMinutes !== undefined) patch.episode_min_minutes = Number(body.episodeMinMinutes)
  if (body.episodeMaxMinutes !== undefined) patch.episode_max_minutes = Number(body.episodeMaxMinutes)
  if (body.scriptFile !== undefined) patch.script_file = body.scriptFile as ScriptFileMeta | null
  if (body.status !== undefined) patch.status = body.status as string
  if (body.characters !== undefined) patch.characters = body.characters as Character[]
  if (body.episodes !== undefined) patch.episodes = body.episodes as Episode[]
  return patch
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError('未登录', 401)

    const project = await fetchProjectById(supabase, user.id, id)
    if (!project) return jsonError('项目未找到', 404)
    return NextResponse.json(project)
  } catch (e) {
    console.error('[GET /api/projects/[id]]', e)
    return jsonError(e instanceof Error ? e.message : '服务器错误', 500)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError('未登录', 401)

    const body = (await req.json()) as Record<string, unknown>
    const updated = await updateProjectForUser(supabase, user.id, id, bodyToPatch(body))
    if (!updated) return jsonError('项目未找到', 404)
    return NextResponse.json(updated)
  } catch (e) {
    console.error('[PATCH /api/projects/[id]]', e)
    return jsonError(e instanceof Error ? e.message : '服务器错误', 500)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return jsonError('未登录', 401)

    const deleted = await deleteProjectForUser(supabase, user.id, id)
    if (!deleted) return jsonError('项目未找到', 404)
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[DELETE /api/projects/[id]]', e)
    return jsonError(e instanceof Error ? e.message : '服务器错误', 500)
  }
}
