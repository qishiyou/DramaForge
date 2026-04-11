-- 创建用户配置表
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建项目表
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  visual_style TEXT NOT NULL,
  storyline TEXT NOT NULL,
  total_episodes INTEGER NOT NULL,
  status TEXT DEFAULT '草稿',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建角色表
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  age TEXT,
  height TEXT,
  personality TEXT,
  appearance TEXT,
  appearance_detail TEXT,
  role TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 若表已存在但缺少外貌详述列，可在 Supabase SQL 编辑器中单独执行：
-- ALTER TABLE characters ADD COLUMN IF NOT EXISTS appearance_detail TEXT;

-- 创建剧集表
CREATE TABLE IF NOT EXISTS episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT,
  status TEXT DEFAULT '草稿',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, episode_number)
);

-- 创建分镜表
CREATE TABLE IF NOT EXISTS storyboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE NOT NULL,
  scene_number INTEGER NOT NULL,
  scene_description TEXT NOT NULL,
  camera_movement TEXT,
  dialogue TEXT,
  character_in_scene TEXT,
  visual_elements TEXT,
  duration TEXT,
  mood TEXT,
  voice_over TEXT,
  color_tone TEXT,
  ai_video_prompt TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_project_id ON characters(project_id);
CREATE INDEX IF NOT EXISTS idx_episodes_project_id ON episodes(project_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_episode_id ON storyboard_entries(episode_id);

-- 启用行级安全策略 (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE storyboard_entries ENABLE ROW LEVEL SECURITY;

-- 用户配置表策略
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 允许用户补建自己的 profile（触发器未执行或历史用户无外键目标时创建项目会失败）
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 项目表策略
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- 角色表策略
CREATE POLICY "Users can view characters of own projects" ON characters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = characters.project_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage characters of own projects" ON characters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = characters.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- 剧集表策略
CREATE POLICY "Users can view episodes of own projects" ON episodes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = episodes.project_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage episodes of own projects" ON episodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = episodes.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- 分镜表策略
CREATE POLICY "Users can view storyboard of own projects" ON storyboard_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM episodes 
      JOIN projects ON projects.id = episodes.project_id
      WHERE episodes.id = storyboard_entries.episode_id 
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage storyboard of own projects" ON storyboard_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM episodes 
      JOIN projects ON projects.id = episodes.project_id
      WHERE episodes.id = storyboard_entries.episode_id 
      AND projects.user_id = auth.uid()
    )
  );

-- 创建触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_episodes_updated_at BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_storyboard_updated_at BEFORE UPDATE ON storyboard_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建函数：用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 创建触发器：新用户注册时自动创建 profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
