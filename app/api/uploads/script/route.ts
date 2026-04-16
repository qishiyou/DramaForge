import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SCRIPT_BUCKET = 'script-documents'
const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_EXT = ['.doc', '.docx', '.md', '.markdown', '.txt', '.pdf']

function hasAllowedExt(name: string): boolean {
  const lower = name.toLowerCase()
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext))
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
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

    const now = Date.now()
    const objectPath = `${user.id}/${now}-${safeName(file.name)}`
    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from(SCRIPT_BUCKET)
      .upload(objectPath, bytes, {
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      })
    if (uploadError) {
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
