import { NextRequest, NextResponse } from 'next/server';
import { getDeepSeekClient, DeepSeekError } from '@/lib/deepseek-client';
import { parseAiJsonResponse } from '@/lib/parse-ai-json';
import { normalizeChineseStoryboardRow } from '@/lib/normalize-shot-duration';

type StoryboardScene = {
  sceneNumber: number;
  sceneDescription: string;
  cameraMovement: string;
  dialogue: string;
  characterInScene: string;
  visualElements: string;
  duration: string;
  mood: string;
  voiceOver: string;
  colorTone: string;
  aiVideoPrompt: string;
};

const CAMERA_EXECUTION_KEYWORDS = ['跟拍', '推镜', '拉镜', '摇镜', '移镜', '升降', '手持', '固定机位', '轨道'];

function toAtTag(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[@，,。；;、\s]/g, '');
  if (!cleaned) {
    return fallback;
  }
  return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
}

function pickPrimaryCharacterTag(characterInScene: string, fallback: string): string {
  const first = characterInScene
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .find(Boolean);
  return toAtTag(first || '', fallback);
}

function ensureSceneAndCharacterInText(text: string, sceneTag: string, characterTag: string): string {
  const safeText = text?.trim() || '';
  const withScene = safeText.includes('@') && /@场景|@\S+_\d+/.test(safeText) ? safeText : `${sceneTag} ${safeText}`.trim();
  const withCharacter = withScene.includes(characterTag) ? withScene : `${characterTag} ${withScene}`.trim();
  return withCharacter;
}

function ensureExecutableCameraMovement(cameraMovement: string, characterTag: string): string {
  const text = cameraMovement?.trim() || '';
  const hasKeyword = CAMERA_EXECUTION_KEYWORDS.some((keyword) => text.includes(keyword));
  const hasDirection = /前|后|左|右|上|下|45度|侧/.test(text);
  const hasTarget = text.includes('@') || text.includes(characterTag) || text.includes('对象');
  if (text.length >= 16 && hasKeyword && (hasDirection || hasTarget)) {
    return text;
  }
  return `手持跟拍，从${characterTag}后侧45度中景跟进，向前移动两步后轻微右摇，交代追逐方向并为下一镜动作承接留钩子`;
}

function buildContinuityLine(index: number, total: number): string {
  if (total <= 1) {
    return '镜头衔接：单镜头片段，无需跨镜衔接，保持角色视线与运动方向稳定。';
  }
  if (index === 0) {
    return '镜头衔接：作为起始镜头，以角色运动方向建立轴线，下一镜沿同向动作切入。';
  }
  if (index === total - 1) {
    return '镜头衔接：承接上一镜的动作惯性与视线方向，收束节奏并完成本段落落点。';
  }
  return '镜头衔接：承接上一镜既定轴线与角色朝向，下一镜保持同向运动并通过景别变化推进节奏。';
}

function ensurePromptStructure(
  prompt: string,
  duration: string,
  sceneTag: string,
  characterTag: string,
  cameraMovement: string,
  dialogue: string,
  continuityLine: string
): string {
  const base = prompt?.trim() || '';
  const blocks = [
    { label: /^0-\S*秒/m, line: `0-${duration.replace('秒', '')}秒` },
    { label: /时间：/m, line: '时间：日' },
    { label: /场景图片：/m, line: `场景图片：${sceneTag}` },
    { label: /镜头调度：/m, line: `镜头调度：${cameraMovement}` },
    { label: /表演与动作：/m, line: `表演与动作：${characterTag} ${dialogue || '保持紧张状态并完成本镜动作目标。'}` },
    { label: /音色：/m, line: '音色：青年音色，语速随动作节奏变化，呼吸感真实。' },
    { label: /特效：/m, line: `特效：以${characterTag}为追踪主体叠加轻量动态信息标记。` },
    { label: /镜头衔接：/m, line: continuityLine },
    { label: /时长：/m, line: `时长：${duration}` },
  ];

  let output = base;
  for (const block of blocks) {
    if (!block.label.test(output)) {
      output = `${output}${output ? '\n' : ''}${block.line}`;
    }
  }

  if (!output.includes(sceneTag)) {
    output = `${sceneTag} ${output}`.trim();
  }
  if (!output.includes(characterTag)) {
    output = `${characterTag} ${output}`.trim();
  }
  if (!output.includes(`时长：${duration}`)) {
    output = output.replace(/时长：\S+秒/g, `时长：${duration}`);
  }
  return output;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { episodeNumber, totalEpisodes, projectTitle, genre, visualStyle, storyline, characters } = body;
    const episodeMinMinutes = Math.max(0.5, Number(body.episodeMinMinutes) || 1);
    const episodeMaxMinutes = Math.max(episodeMinMinutes, Number(body.episodeMaxMinutes) || 1.5);
    const minSeconds = Math.round(episodeMinMinutes * 60);
    const maxSeconds = Math.round(episodeMaxMinutes * 60);
    const episodeDurationText = `${episodeMinMinutes}-${episodeMaxMinutes} 分钟（${minSeconds}-${maxSeconds} 秒）`;

    if (!episodeNumber) {
      return NextResponse.json(
        { error: '缺少必需参数' },
        { status: 400 }
      );
    }

    const client = getDeepSeekClient();

    const prompt = `你是一位专业的竖屏短剧分镜编剧兼执行导演。请根据以下信息生成第${episodeNumber}集的分镜脚本：

项目标题：${projectTitle || '未命名项目'}
集数：第${episodeNumber}集 / 共${totalEpisodes}集
剧本类型：${genre || '未指定'}
视觉风格：${visualStyle || '未指定'}
故事梗概：${storyline || '无'}
主要角色：${characters ? JSON.stringify(characters) : '无'}
（角色对象中的 appearance 为外貌关键词，appearanceDetail 为外貌详细描述；写分镜与视频提示词时，人物外形、发型、服装须与上述设定一致。）

【短剧节奏硬性要求——必须遵守】
1. 单集总时长必须落在项目设定区间：**${episodeDurationText}**，本集 storyboard 中所有镜头的 duration 相加应落在该区间（允许少量偏差，但禁止明显偏离）。
2. **每一条 storyboard 对应一个独立镜头（一次 AI 视频生成片段）**。每个镜头的时长 **必须且只能** 在 **3～8 秒** 之间，写成「3秒」「4秒」…「8秒」这种整数秒形式。
3. **禁止** 出现 9 秒及以上、或「15秒」「30秒」「45秒」「1分钟」等长镜头表述；若剧情需要更长内容，请 **拆成多个 3～8 秒的连续分镜**，而不是拉长单条时长。
4. 在总时长 **${episodeDurationText}** 的前提下，按每镜 3～8 秒自行规划分镜条数，保证叙事完整；少用大块对话挤在一条里。
5. 每条分镜台词宜短促，适合 3～8 秒内念完或对口型。
6. 若某角色填写了 appearanceDetail，则该角色出场的 sceneDescription、visualElements、aiVideoPrompt 中的外形描述须与外貌详细描述相符。

【sceneDescription 完整场景描述——硬性要求】
每条分镜的 **sceneDescription** 必须是**可直接交给摄影与 AI 视频执行的完整文字**，用中文写成连贯段落（可含换行），**每条建议不少于 120 个汉字**；禁止仅用一句话敷衍（如「两人在客厅说话」）。须尽量覆盖下列维度（能写尽写，勿写「略」「待补充」）：
- **时空与光线**：日/夜、大致时段、主光方向、明暗对比、色温感受（与 colorTone 呼应）。
- **空间与环境**：内景/外景、具体房间或街区层次、陈设、景深（前景/中景/背景有何物）、天气或空气感（若适用）。
- **人物与表演**：谁入画、站位与朝向、关键动作与微表情、走位或手势；若某角色有 appearanceDetail，须写出可见的外形细节（发型、服装、体态）。
- **道具与细节**：本镜关键道具、手持物、屏幕/门窗等与环境交互。
- **声音与节奏感（可选一句）**：环境音或静音感，是否强调某声效（不写具体台词，台词放 dialogue）。
- **叙事作用**：本镜在情节上的功能（建立关系/铺垫/转折/反应镜头等），一句话即可。

**visualElements** 须与 sceneDescription 互补：侧重画面可被拍到的光影、质感、构图重点，避免与 sceneDescription 完全重复时可写更提炼的关键词组。

【场景与角色 @引用 —— 强制规范】
1. 每条分镜必须在描述文本中显式使用 @引用，至少包含：
   - 1 个场景引用：如 @场景1、@山林_11、@仓库_夜
   - 1 个角色引用：如 @女主张小姐、@张尘
2. @场景用于标记本镜使用的主场景素材或场景编号；@角色用于标记本镜核心表演角色。
3. 同一角色在全剧中命名必须统一，禁止同一人多种写法（如 @张尘 / @男主张尘 混用）。
4. 在 dialogue、sceneDescription、aiVideoPrompt 中都可使用 @引用，但至少 sceneDescription 与 aiVideoPrompt 必须出现 @场景 和 @角色。

【导演执行与镜头衔接——强制规范】
1. cameraMovement 不是抽象词，必须是可执行调度指令：机位位置、运动方式、跟随对象、运动方向、运动目的至少覆盖 3 项。
2. 每条分镜要写清“上一镜头如何接入本镜头、下一镜头如何承接”（动作轴线、视线方向、景别变化、节奏变化至少一个依据）。
3. 禁止“看起来专业但无法执行”的空话（如“电影感十足”“高级镜头语言”）；必须可被摄影、灯光、演员直接执行。
4. 镜头衔接需遵守连续性：角色朝向、运动方向、空间方位前后不打架；如有跳轴或时空跳切，必须明确写出意图（如制造错乱、回忆闪回）。
5. 每条 aiVideoPrompt 必须体现时间段、时间属性（如日/夜）、场景图、镜头调度、表演文本、音色、特效，并保持与 duration 一致。

请生成分镜，包含：
1. 分镜列表（条数符合上文 1～3 分钟单集、每镜 3～8 秒的要求）
2. 每条：**完整详尽的 sceneDescription**（见上文硬性要求）、时间地点人物动作、对话（可极短）
3. 镜头之间的衔接逻辑（体现在相邻 sceneDescription 的时空与动作承接上）
4. 每条对应的中文视频拍摄提示词（含合规时长；**画面内容**须与 sceneDescription 信息一致且可执行）

请以JSON格式返回，结构如下：
{
  "episodeTitle": "第${episodeNumber}集标题",
  "episodeSynopsis": "本集剧情简介（150-280字，写清本集冲突与落点）",
  "storyboard": [
    {
      "sceneNumber": 1,
      "sceneDescription": "完整场景段落：含时空、环境、人物站位与动作、关键细节、叙事作用等，建议不少于120字",
      "cameraMovement": "可执行镜头调度（需包含机位/运动/对象/方向/目的中的至少3项，如：手持跟拍，从@张尘后侧45度中景跟进3步，随后轻微右摇让出追兵位置，强调追逐压迫）",
      "dialogue": "角色对话内容（如果有多个角色，用换行分隔，格式：角色名：对话内容）",
      "characterInScene": "出场角色（用逗号分隔）",
      "visualElements": "光线、色调、道具、构图重点、质感等（可与 sceneDescription 形成互补）",
      "duration": "仅允许 3秒～8秒 之间的整数秒，例如「5秒」",
      "mood": "氛围情绪（如：紧张、温馨、激动、悲伤等）",
      "voiceOver": "画外音内容（如果有的话，没有则为空字符串）",
      "colorTone": "画面色调（如：暖色调、冷色调、高对比度、柔和光线等）",
      "aiVideoPrompt": "完整的中文视频拍摄提示词，必须严格采用以下可执行结构并包含@引用：\n0-X秒（X必须等于duration秒数）\n时间：日/夜\n场景图片：@场景编号或名称\n镜头调度：可执行导演指令（机位+运动+对象+方向+目的）\n表演与动作：使用@角色描述动作与台词\n音色：声线、年龄感、语气、强弱、节奏\n特效：可执行的画面特效或信息叠加\n镜头衔接：说明与上一镜头/下一镜头的连接依据\n时长：3秒～8秒且与duration一致"
    }
  ]
}

注意：
1. 每条分镜的 duration 与 aiVideoPrompt 中的【时长】必须一致，且为 3～8 秒。
2. AI 视频提示词必须是中文，信息完整；**sceneDescription 越长越细越好**，不得因长度而省略关键视觉信息。
3. 分镜之间要有逻辑连贯性。
4. 对话要符合角色性格；**禁止**在单条分镜内写超出 3～8 秒能拍完的长对白。
5. 提示词需可直接用于短视频/AI 视频工具（单片段 3～8 秒）。
6. sceneDescription 与 aiVideoPrompt 中都必须出现 @场景 与 @角色。
7. 镜头衔接必须明确写出衔接依据（动作、轴线、视线、景别或节奏）。`;

    const aiResponse = await client.chat({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            `你是竖屏短剧分镜编剧，擅长写**信息密度高、可直接拍摄**的完整场景描述。单镜头（单条分镜）时长永远只能是 3～8 秒；单集总长必须落在 ${episodeDurationText}，通过增加分镜条数完成叙事。禁止在 JSON 里写 30 秒、1 分钟等单镜头时长。` +
            '每条 sceneDescription 必须详尽、成段，优先写满视觉与空间信息，而不是概括性短句。' +
            '你必须使用 @场景 和 @角色 引用，并保证同一角色命名统一。' +
            '你必须给出可执行的导演调度与镜头衔接依据，禁止空泛术语。' +
            '你必须只输出一个 JSON 对象，不要 markdown 代码块、不要前言后语。字符串内的引号请用中文直角引号「」或单引号，避免未转义的英文双引号打断 JSON。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.45,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    });

    const content = aiResponse.choices[0]?.message?.content;
    if (!content) {
      throw new Error('AI 未返回有效内容');
    }

    const finishReason = aiResponse.choices[0]?.finish_reason;
    let response: Record<string, unknown>;
    try {
      response = parseAiJsonResponse(content);
    } catch (parseErr) {
      console.error('JSON 解析失败, finish_reason:', finishReason, parseErr);
      console.error('AI 响应前 2500 字:', content?.slice(0, 2500));
      if (finishReason === 'length') {
        throw new Error(
          '单次生成长度达到上限，输出被截断无法组成完整 JSON。请点击「重新生成」重试；若仍失败，可稍后再试或减少单集剧情复杂度。'
        );
      }
      throw new Error(
        'AI 返回内容无法解析为有效 JSON。请点击「重新生成」；若多次失败，请稍后再试。'
      );
    }

    // 验证响应数据
    if (!response.storyboard || !Array.isArray(response.storyboard)) {
      throw new Error('AI 返回的数据格式不正确：缺少 storyboard 字段');
    }

    // 补全基础字段；单镜头 3～8 秒由 normalize 处理（合法秒数保留，仅非法或缺失时回落）
    const normalizedStoryboard: StoryboardScene[] = response.storyboard.map((scene: any, index: number) => {
      const rawDuration =
        scene.duration != null && String(scene.duration).trim() !== ''
          ? String(scene.duration).trim()
          : undefined

      const aiVideoPromptRaw =
        typeof scene.aiVideoPrompt === 'string' && scene.aiVideoPrompt.trim() !== ''
          ? scene.aiVideoPrompt.trim()
          : `【镜头语言】固定镜头 【画面内容】场景${index + 1} 【对话】无 【画外音】无 【色调】自然光 【氛围】平静 【时长】5秒`

      const { duration, aiVideoPrompt } = normalizeChineseStoryboardRow(
        { duration: rawDuration, aiVideoPrompt: aiVideoPromptRaw },
        index
      )

      return {
        sceneNumber: scene.sceneNumber || index + 1,
        sceneDescription: scene.sceneDescription || '',
        cameraMovement: scene.cameraMovement || '固定镜头',
        dialogue: scene.dialogue || '',
        characterInScene: scene.characterInScene || '',
        visualElements: scene.visualElements || '',
        duration,
        mood: scene.mood || '平静',
        voiceOver: scene.voiceOver || '',
        colorTone: scene.colorTone || '自然光',
        aiVideoPrompt,
      }
    });

    // 二次校验：补齐 @场景/@角色、可执行镜头调度、镜头衔接结构
    response.storyboard = normalizedStoryboard.map((scene, index, allScenes) => {
      const sceneTag = `@场景${scene.sceneNumber || index + 1}`;
      const characterTag = pickPrimaryCharacterTag(scene.characterInScene, '@角色1');
      const continuityLine = buildContinuityLine(index, allScenes.length);
      const cameraMovement = ensureExecutableCameraMovement(scene.cameraMovement, characterTag);
      const sceneDescription = ensureSceneAndCharacterInText(scene.sceneDescription, sceneTag, characterTag);
      const aiVideoPrompt = ensurePromptStructure(
        scene.aiVideoPrompt,
        scene.duration,
        sceneTag,
        characterTag,
        cameraMovement,
        scene.dialogue,
        continuityLine
      );

      return {
        ...scene,
        cameraMovement,
        sceneDescription: sceneDescription.includes('镜头衔接：')
          ? sceneDescription
          : `${sceneDescription}\n${continuityLine}`,
        aiVideoPrompt,
      };
    });

    // 返回 JSON 响应
    return NextResponse.json(response);
  } catch (error) {
    console.error('Generate error:', error);

    if (error instanceof DeepSeekError) {
      return NextResponse.json(
        { error: `AI 服务错误: ${error.message}` },
        { status: error.statusCode || 500 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : '生成失败，请稍后重试';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
