import { NextRequest, NextResponse } from 'next/server';
import { getDeepSeekClient, DeepSeekError } from '@/lib/deepseek-client';
import { parseAiJsonResponse } from '@/lib/parse-ai-json';
import { normalizeEpisodeSceneRow } from '@/lib/normalize-shot-duration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectTitle, episodeNumber, episodeTitle, outline, characters } = body;
    const episodeMinMinutes = Math.max(0.5, Number(body.episodeMinMinutes) || 1);
    const episodeMaxMinutes = Math.max(episodeMinMinutes, Number(body.episodeMaxMinutes) || 1.5);
    const minSeconds = Math.round(episodeMinMinutes * 60);
    const maxSeconds = Math.round(episodeMaxMinutes * 60);
    const episodeDurationText = `${episodeMinMinutes}-${episodeMaxMinutes} 分钟（${minSeconds}-${maxSeconds} 秒）`;

    if (!projectTitle || !episodeNumber) {
      return NextResponse.json(
        { error: '项目标题和集数是必需的' },
        { status: 400 }
      );
    }

    const client = getDeepSeekClient();

    const prompt = `你是一位专业的剧本创作助手。请根据以下信息生成第${episodeNumber}集的详细剧本：

项目标题：${projectTitle}
集数：第${episodeNumber}集
集标题：${episodeTitle || ''}
${outline ? `剧本大纲：${outline}` : ''}
${characters ? `主要角色：${JSON.stringify(characters)}` : ''}
${characters ? '（appearance 为外貌关键词，appearanceDetail 为外貌详细描述；剧本与镜头描述中人物外形须与之一致。）' : ''}

【短剧节奏】单集全长必须落在 **${episodeDurationText}**；**每个场景对应一个独立镜头（单次 AI 生成片段）**，单镜头时长 **仅允许 3～8 秒**（写如 "5s" 或 "5 seconds"），禁止 15 秒、30 秒、1 分钟等长镜头；需要更长叙事请增加 scenes 条数。

【description 完整场景描述——硬性要求】
每个场景的 **description** 必须是**完整、可执行的中文段落**（可含换行），**每条建议不少于 120 个汉字**，禁止一句话带过。须尽量写清：
- 日/夜、时段与光线气氛；内景/外景及空间层次、陈设与景深。
- 人物站位、动作、表情；若角色有 appearanceDetail，须写出可见外形细节。
- 关键道具、环境声或静音感（一句即可）；本镜在叙事上的作用（建立/转折/反应等）。
location、time 可与 description 呼应但不得代替 description；**信息主体必须在 description 里**。

请生成剧本，包含：
1. 场景列表（条数符合短剧单集 **${episodeDurationText}**、每镜 3～8 秒）
2. 每个场景的 **完整详尽 description**（见上文）、以及时间、地点、人物、动作、对话
3. 场景之间的转场说明（transition 可与相邻 description 连贯）
4. 每个场景的英文 AI 视频提示词（专业电影术语；须与 description 画面信息一致；提示词中应暗示该片段为 3～8 秒短视频镜头）

请以JSON格式返回，结构如下：
{
  "scenes": [
    {
      "number": 1,
      "location": "具体地点（可与 description 一致或提炼）",
      "time": "时间（可与 description 一致或提炼）",
      "characters": ["角色1", "角色2"],
      "description": "完整场景段落：时空、环境、人物与动作、细节、叙事作用等，建议不少于120字",
      "dialogue": [
        {"character": "角色名", "line": "台词内容"}
      ],
      "transition": "转场说明（与下一镜衔接）",
      "cameraMovement": "镜头运动描述（可附简要目的）",
      "visualElements": "光线、构图、质感、关键视觉元素（与 description 互补或提炼）",
      "mood": "氛围情绪",
      "duration": "仅 3～8 秒，如 5 seconds",
      "aiVideoPrompt": "英文提示词；含 shot type, lighting, subject action, mood；必须与 description 画面一致；体现 single clip 3-8 seconds max"
    }
  ]
}`;

    const response = await client.chat({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            `你是竖屏短剧编剧，擅长写**信息完整、可直接用于拍摄与 AI 视频**的场景段落。每个场景的 duration 只能是 3～8 秒的单镜头；单集必须落在 ${episodeDurationText} 靠多条场景拼接。每个场景的 description 必须详尽成段，优先写满视觉与空间信息。`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.55,
      max_tokens: 8192,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('未收到有效响应');
    }

    let episode: Record<string, unknown> | { raw: string };
    try {
      episode = parseAiJsonResponse(content);
    } catch {
      episode = { raw: content };
    }

    if (episode && typeof episode === 'object' && !('raw' in episode)) {
      const ep = episode as Record<string, unknown>;
      const scenes = ep.scenes;
      if (Array.isArray(scenes)) {
        ep.scenes = scenes.map((row: unknown) => {
          if (!row || typeof row !== 'object') return row;
          const r = row as Record<string, unknown>;
          const rawDur =
            r.duration != null && String(r.duration).trim() !== ''
              ? String(r.duration).trim()
              : undefined;
          const rawPrompt =
            r.aiVideoPrompt != null && String(r.aiVideoPrompt).trim() !== ''
              ? String(r.aiVideoPrompt).trim()
              : undefined;
          const { duration, aiVideoPrompt } = normalizeEpisodeSceneRow({
            duration: rawDur,
            aiVideoPrompt: rawPrompt,
          });
          return { ...r, duration, aiVideoPrompt };
        });
      }
    }

    return NextResponse.json({
      success: true,
      episode,
      usage: response.usage,
    });
  } catch (error) {
    console.error('Generate episode error:', error);

    if (error instanceof DeepSeekError) {
      return NextResponse.json(
        { error: error.message, statusCode: error.statusCode },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: '生成剧集失败，请稍后重试' },
      { status: 500 }
    );
  }
}
