import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import type {
  Project,
  Character,
  Episode,
  StoryboardEntry,
  Genre,
  VisualStyle,
  ProjectStatus,
} from '@/lib/types'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type CharacterRow = Database['public']['Tables']['characters']['Row']
type EpisodeRow = Database['public']['Tables']['episodes']['Row']
type StoryboardRow = Database['public']['Tables']['storyboard_entries']['Row']

function mapStoryboard(row: StoryboardRow): StoryboardEntry {
  return {
    id: row.id,
    sceneNumber: row.scene_number,
    sceneDescription: row.scene_description ?? '',
    cameraMovement: row.camera_movement ?? '',
    dialogue: row.dialogue ?? '',
    characterInScene: row.character_in_scene ?? '',
    visualElements: row.visual_elements ?? '',
    duration: row.duration ?? '',
    mood: row.mood ?? '',
    voiceOver: row.voice_over ?? '',
    colorTone: row.color_tone ?? '',
    aiVideoPrompt: row.ai_video_prompt ?? '',
  }
}

function mapCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    age: row.age ?? '',
    height: row.height ?? '',
    personality: row.personality ?? '',
    appearance: row.appearance ?? '',
    appearanceDetail: row.appearance_detail ?? '',
    role: row.role ?? '',
  }
}

function mapEpisode(row: EpisodeRow, storyboard: StoryboardEntry[]): Episode {
  return {
    id: row.id,
    episodeNumber: row.episode_number,
    title: row.title,
    synopsis: row.synopsis ?? '',
    storyboard,
    status: row.status as ProjectStatus,
  }
}

function mapProject(
  row: ProjectRow,
  characters: Character[],
  episodes: Episode[]
): Project {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre as Genre,
    visualStyle: row.visual_style as VisualStyle,
    storyline: row.storyline,
    totalEpisodes: row.total_episodes,
    episodeMinMinutes: row.episode_min_minutes ?? 1,
    episodeMaxMinutes: row.episode_max_minutes ?? 1.5,
    status: row.status as ProjectStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    characters,
    episodes,
  }
}

function groupBy<K extends string, T extends Record<K, string>>(rows: T[], key: K): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = r[key]
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(r)
  }
  return m
}

export async function fetchProjectsForUser(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<Project[]> {
  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  if (!projects?.length) return []

  return assembleProjects(supabase, projects)
}

export async function fetchProjectById(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string
): Promise<Project | null> {
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!project) return null

  const [assembled] = await assembleProjects(supabase, [project])
  return assembled ?? null
}

async function assembleProjects(
  supabase: SupabaseClient<Database>,
  projectRows: ProjectRow[]
): Promise<Project[]> {
  const ids = projectRows.map((p) => p.id)
  if (ids.length === 0) return []

  const [{ data: charRows, error: e1 }, { data: epRows, error: e2 }] = await Promise.all([
    supabase.from('characters').select('*').in('project_id', ids),
    supabase.from('episodes').select('*').in('project_id', ids).order('episode_number'),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const episodeIds = (epRows ?? []).map((e) => e.id)
  const { data: sbRows, error: e3 } =
    episodeIds.length > 0
      ? await supabase
          .from('storyboard_entries')
          .select('*')
          .in('episode_id', episodeIds)
          .order('scene_number')
      : { data: [], error: null }
  if (e3) throw e3

  const charsByProject = groupBy(charRows ?? [], 'project_id')
  const epsByProject = groupBy(epRows ?? [], 'project_id')
  const sbByEpisode = groupBy(sbRows ?? [], 'episode_id')

  return projectRows.map((pr) => {
    const chars = (charsByProject.get(pr.id) ?? [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(mapCharacter)
    const eps = (epsByProject.get(pr.id) ?? []).map((er) => {
      const sbs = (sbByEpisode.get(er.id) ?? []).map(mapStoryboard)
      return mapEpisode(er, sbs)
    })
    return mapProject(pr, chars, eps)
  })
}

function storyboardToInsert(episodeId: string, e: StoryboardEntry): Database['public']['Tables']['storyboard_entries']['Insert'] {
  return {
    id: e.id,
    episode_id: episodeId,
    scene_number: e.sceneNumber,
    scene_description: e.sceneDescription || ' ',
    camera_movement: e.cameraMovement ?? '',
    dialogue: e.dialogue ?? '',
    character_in_scene: e.characterInScene ?? '',
    visual_elements: e.visualElements ?? '',
    duration: e.duration ?? '',
    mood: e.mood ?? '',
    voice_over: e.voiceOver ?? '',
    color_tone: e.colorTone ?? '',
    ai_video_prompt: e.aiVideoPrompt ?? '',
  }
}

export async function createProjectForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  body: {
    title: string
    genre: string
    visual_style: string
    storyline: string
    total_episodes: number
    episode_min_minutes: number
    episode_max_minutes: number
    characters: Character[]
    episodes: Episode[]
  }
): Promise<Project> {
  const projectId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error: pe } = await supabase.from('projects').insert({
    id: projectId,
    user_id: userId,
    title: body.title,
    genre: body.genre,
    visual_style: body.visual_style,
    storyline: body.storyline,
    total_episodes: body.total_episodes,
    episode_min_minutes: body.episode_min_minutes,
    episode_max_minutes: body.episode_max_minutes,
    status: '草稿',
    created_at: now,
    updated_at: now,
  })
  if (pe) throw pe

  if (body.characters.length) {
    const charInserts = body.characters.map((c) => ({
      id: c.id,
      project_id: projectId,
      name: c.name,
      age: c.age ?? '',
      height: c.height ?? '',
      personality: c.personality ?? '',
      appearance: c.appearance ?? '',
      appearance_detail: c.appearanceDetail ?? '',
      role: c.role ?? '',
    }))
    const { error: ce } = await supabase.from('characters').insert(charInserts)
    if (ce) throw ce
  }

  for (const ep of body.episodes) {
    const { error: ee } = await supabase.from('episodes').insert({
      id: ep.id,
      project_id: projectId,
      episode_number: ep.episodeNumber,
      title: ep.title,
      synopsis: ep.synopsis ?? '',
      status: ep.status,
      created_at: now,
      updated_at: now,
    })
    if (ee) throw ee
  }

  const full = await fetchProjectById(supabase, userId, projectId)
  if (!full) throw new Error('创建后读取项目失败')
  return full
}

export type ProjectUpdateInput = Partial<{
  title: string
  genre: string
  visual_style: string
  storyline: string
  total_episodes: number
  episode_min_minutes: number
  episode_max_minutes: number
  status: string
  characters: Character[]
  episodes: Episode[]
}>

export async function updateProjectForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string,
  patch: ProjectUpdateInput
): Promise<Project | null> {
  const existing = await fetchProjectById(supabase, userId, projectId)
  if (!existing) return null

  const now = new Date().toISOString()
  const row: Database['public']['Tables']['projects']['Update'] = { updated_at: now }
  if (patch.title !== undefined) row.title = patch.title
  if (patch.genre !== undefined) row.genre = patch.genre
  if (patch.visual_style !== undefined) row.visual_style = patch.visual_style
  if (patch.storyline !== undefined) row.storyline = patch.storyline
  if (patch.total_episodes !== undefined) row.total_episodes = patch.total_episodes
  if (patch.episode_min_minutes !== undefined) row.episode_min_minutes = patch.episode_min_minutes
  if (patch.episode_max_minutes !== undefined) row.episode_max_minutes = patch.episode_max_minutes
  if (patch.status !== undefined) row.status = patch.status

  const touchesProjectRow =
    patch.title !== undefined ||
    patch.genre !== undefined ||
    patch.visual_style !== undefined ||
    patch.storyline !== undefined ||
    patch.total_episodes !== undefined ||
    patch.episode_min_minutes !== undefined ||
    patch.episode_max_minutes !== undefined ||
    patch.status !== undefined ||
    patch.characters !== undefined ||
    patch.episodes !== undefined

  if (touchesProjectRow) {
    const { error } = await supabase.from('projects').update(row).eq('id', projectId).eq('user_id', userId)
    if (error) throw error
  }

  if (patch.characters) {
    const { error: del } = await supabase.from('characters').delete().eq('project_id', projectId)
    if (del) throw del
    if (patch.characters.length) {
      const rows = patch.characters.map((c) => ({
        id: c.id,
        project_id: projectId,
        name: c.name,
        age: c.age ?? '',
        height: c.height ?? '',
        personality: c.personality ?? '',
        appearance: c.appearance ?? '',
        appearance_detail: c.appearanceDetail ?? '',
        role: c.role ?? '',
      }))
      const { error: ins } = await supabase.from('characters').insert(rows)
      if (ins) throw ins
    }
  }

  if (patch.episodes) {
    const { data: dbEps } = await supabase.from('episodes').select('id').eq('project_id', projectId)
    const clientIds = new Set(patch.episodes.map((e) => e.id))
    const toRemove = (dbEps ?? []).map((e) => e.id).filter((id) => !clientIds.has(id))
    if (toRemove.length) {
      const { error: de } = await supabase.from('episodes').delete().in('id', toRemove)
      if (de) throw de
    }

    const now = new Date().toISOString()
    for (const ep of patch.episodes) {
      const { error: up } = await supabase.from('episodes').upsert(
        {
          id: ep.id,
          project_id: projectId,
          episode_number: ep.episodeNumber,
          title: ep.title,
          synopsis: ep.synopsis ?? '',
          status: ep.status,
          updated_at: now,
        },
        { onConflict: 'id' }
      )
      if (up) throw up

      const { error: ds } = await supabase.from('storyboard_entries').delete().eq('episode_id', ep.id)
      if (ds) throw ds

      if (ep.storyboard.length) {
        const inserts = ep.storyboard.map((s) => storyboardToInsert(ep.id, s))
        const { error: si } = await supabase.from('storyboard_entries').insert(inserts)
        if (si) throw si
      }
    }
  }

  return fetchProjectById(supabase, userId, projectId)
}

export async function deleteProjectForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId)
    .select('id')

  if (error) throw error
  return (data?.length ?? 0) > 0
}
