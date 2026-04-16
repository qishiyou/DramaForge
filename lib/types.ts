export type Genre =
  | '复仇'
  | '爱情'
  | '甜宠'
  | '霸总'
  | '虐恋'
  | '悬疑'
  | '喜剧'
  | '奇幻'
  | '都市'
  | '古装'
  | '科幻'
  | '武侠'
  | '仙侠'
  | '恐怖'
  | '历史'
  | '战争'
  | '犯罪'
  | '青春'
  | '家庭'
  | '励志'
  | '穿越'
  | '重生'
  | '系统流'
  | '脑洞'
  | '宫廷'
  | '民国'
  | '电竞'
  | '末世'
  | '乡村'
  | '职场'
  | '二次元'
  | '刑侦'
  | '律政'
  | '医疗'
  | '军旅'

export type VisualStyle =
  | '真人实拍'
  | '动漫'
  | '3D动漫'
  | '三渲二'
  | '国漫风'
  | '美漫风'
  | 'CG'
  | '电影'
  | '卡通'
  | '水墨画'
  | '赛博朋克'
  | '蒸汽朋克'
  | '像素风'
  | '油画风'
  | '漫画风'
  | '写实主义'
export type ProjectStatus = '草稿' | '生成中' | '已完成'

export interface Character {
  id: string
  name: string
  age: string
  height: string
  personality: string
  /** 外貌关键词或一句话概括（可选） */
  appearance: string
  /** 剧中人物外貌详细描述（脸型、发型、五官、体型、服装、标志性特征等，供分镜与 AI 参考） */
  appearanceDetail?: string
  role: string
}

export interface ScriptFileMeta {
  path: string
  name: string
  mimeType: string
  size: number
  url?: string
}

export interface StoryboardEntry {
  id: string
  sceneNumber: number
  /** 完整场景描述：宜包含时空与光线、空间与环境、人物站位与动作、道具与叙事作用等，越细越利于拍摄与 AI 成片 */
  sceneDescription: string
  cameraMovement: string
  dialogue: string
  characterInScene: string
  visualElements: string
  duration: string
  mood: string
  voiceOver: string // 画外音
  colorTone: string // 画面色调
  aiVideoPrompt: string // AI 视频生成提示词（中文）
  promptQuality?: {
    score: number
    issues: string[]
  }
}

export interface Episode {
  id: string
  episodeNumber: number
  title: string
  synopsis: string
  storyboard: StoryboardEntry[]
  status: ProjectStatus
}

export interface Project {
  id: string
  title: string
  genre: Genre
  visualStyle: VisualStyle
  storyline: string
  totalEpisodes: number
  /** 每集最小时长（分钟） */
  episodeMinMinutes: number
  /** 每集最大时长（分钟） */
  episodeMaxMinutes: number
  scriptFile?: ScriptFileMeta | null
  characters: Character[]
  episodes: Episode[]
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}
