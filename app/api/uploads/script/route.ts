import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

const SCRIPT_BUCKET = 'script-documents'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_EXT = ['.doc', '.docx', '.md', '.markdown', '.txt', '.pdf']

function hasAllowedExt(name: string): boolean {
  const lower = name.toLowerCase()
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext))
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]/g, '_')
}

function safeStorageObjectName(originalName: string): string {
  const dotIndex = originalName.lastIndexOf('.')
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase().replace(/[^a-z0-9.]/g, '') : ''
  const randomPart = Math.random().toString(36).slice(2, 10)
  return `${Date.now()}-${randomPart}${ext || '.bin'}`
}

async function tryCreateBucketWithServiceRole(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRole) return false

  const admin = createClient<Database>(url, serviceRole)
  const { data: buckets, error: listError } = await admin.storage.listBuckets()
  if (listError) return false
  if ((buckets ?? []).some((b) => b.name === SCRIPT_BUCKET || b.id === SCRIPT_BUCKET)) {
    return true
  }

  const { error: createError } = await admin.storage.createBucket(SCRIPT_BUCKET, { public: true })
  return !createError
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '未选择文件' }, { status: 400 })
    }

    if (!hasAllowedExt(file.name)) {
      return NextResponse.json({ error: '仅支持 Word/MD/TXT/PDF 文档' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过 20MB' }, { status: 400 })
    }

    const objectPath = `${user.id}/${safeStorageObjectName(file.name)}`
    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from(SCRIPT_BUCKET)
      .upload(objectPath, bytes, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
    if (uploadError) {
      if (/bucket not found/i.test(uploadError.message)) {
        const created = await tryCreateBucketWithServiceRole()
        if (created) {
          const { error: retryError } = await supabase.storage
            .from(SCRIPT_BUCKET)
            .upload(objectPath, bytes, {
              upsert: false,
              contentType: file.type || 'application/octet-stream',
            })
          if (!retryError) {
            const { data } = supabase.storage.from(SCRIPT_BUCKET).getPublicUrl(objectPath)
            return NextResponse.json({
              path: objectPath,
              name: file.name,
              mimeType: file.type || 'application/octet-stream',
              size: file.size,
              url: data.publicUrl || '',
            })
          }
          return NextResponse.json({ error: `上传失败: ${retryError.message}` }, { status: 500 })
        }
        return NextResponse.json(
          {
            error:
              '上传失败: 未找到存储桶 script-documents。请先执行数据库迁移 003_script_upload_support.sql，或在服务端配置 SUPABASE_SERVICE_ROLE_KEY 以自动创建。',
          },
          { status: 500 }
        )
      }
      return NextResponse.json({ error: `上传失败: ${uploadError.message}` }, { status: 500 })
    }

    const { data } = supabase.storage.from(SCRIPT_BUCKET).getPublicUrl(objectPath)
    return NextResponse.json({
      path: objectPath,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      url: data.publicUrl || '',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '上传失败'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
