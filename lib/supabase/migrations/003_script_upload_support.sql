ALTER TABLE projects
ADD COLUMN IF NOT EXISTS script_file_path TEXT,
ADD COLUMN IF NOT EXISTS script_file_name TEXT,
ADD COLUMN IF NOT EXISTS script_file_mime_type TEXT,
ADD COLUMN IF NOT EXISTS script_file_size BIGINT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('script-documents', 'script-documents', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload script documents'
  ) THEN
    CREATE POLICY "Authenticated users can upload script documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'script-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can update own script documents'
  ) THEN
    CREATE POLICY "Authenticated users can update own script documents"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'script-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can delete own script documents'
  ) THEN
    CREATE POLICY "Authenticated users can delete own script documents"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'script-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END
$$;
