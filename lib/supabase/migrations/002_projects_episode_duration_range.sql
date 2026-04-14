ALTER TABLE projects
ADD COLUMN IF NOT EXISTS episode_min_minutes DOUBLE PRECISION NOT NULL DEFAULT 1.0;

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS episode_max_minutes DOUBLE PRECISION NOT NULL DEFAULT 1.5;

UPDATE projects
SET
  episode_min_minutes = COALESCE(episode_min_minutes, 1.0),
  episode_max_minutes = COALESCE(episode_max_minutes, 1.5);
