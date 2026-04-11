import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * projects.user_id 外键指向 profiles(id)。若注册时未写入 profile（触发器未建或旧用户），
 * 插入项目会外键失败 → 500。在创建资源前保证存在 profile。
 */
export async function ensureProfileForUser(
  supabase: SupabaseClient<Database>,
  user: User
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) throw error
  if (data) return

  const meta = user.user_metadata as { full_name?: string } | undefined
  const { error: ins } = await supabase.from('profiles').insert({
    id: user.id,
    email: user.email ?? '',
    full_name: meta?.full_name ?? null,
  })
  if (ins) throw ins
}
