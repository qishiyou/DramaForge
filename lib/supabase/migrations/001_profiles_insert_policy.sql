-- 已有数据库请手动在 Supabase SQL 编辑器执行一次（若尚未存在该策略）。
-- 否则 API 无法在缺少 profile 行时补建用户资料，创建项目会外键失败 500。

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
