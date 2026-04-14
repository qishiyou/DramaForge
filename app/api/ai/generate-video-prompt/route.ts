import { NextRequest, NextResponse } from 'next/server';
import { getDeepSeekClient, DeepSeekError } from '@/lib/deepseek-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sceneDescription, 
      visualElements, 
      cameraMovement, 
      mood, 
      characterInScene,
      visualStyle,
      genre 
    } = body;

    if (!sceneDescription) {
      return NextResponse.json(
        { error: '场景描述是必需的' },
        { status: 400 }
      );
    }

    const client = getDeepSeekClient();

    const prompt = `你是一位专业的 AI 视频生成提示词专家兼执行导演。请根据以下分镜信息，生成一个详细、专业、可执行的 AI 视频生成提示词（适用于 Runway、Pika、Sora 等视频生成工具）。

分镜信息：
- 场景描述（请完整消化其中所有时空、环境、人物与动作细节，勿随意丢弃信息）：${sceneDescription}
- 视觉元素：${visualElements || '无'}
- 镜头运动：${cameraMovement || '无'}
- 氛围情绪：${mood || '无'}
- 场景角色：${characterInScene || '无'}
- 视觉风格：${visualStyle || '无'}
- 剧本类型：${genre || '无'}

请生成一个中文的 AI 视频提示词，要求：
1. 使用专业且可执行的电影术语；**场景描述越长，提示词应覆盖得越细**（空间层次、光线、人物外形与动作、道具等），避免笼统概括。
2. 强制加入 @引用：至少包含一个 @场景（如 @山林_11）和一个 @角色（如 @女主张小姐、@张尘）。
3. 镜头调度必须可执行：机位、运动方式、跟随对象、方向、目的至少覆盖 3 项，禁止空泛话术。
4. 强化镜头衔接：写明本镜头如何承接上一镜头/如何给下一镜头留动作或视线钩子，确保连续性可拍。
5. 动作量必须适合单条视频约 3～8 秒（竖屏短剧单镜头），不要写成可拍 30 秒以上的长镜头叙事。
6. 符合指定视觉风格，并清晰描述光线、色调、氛围、声音与特效。
7. 不使用逗号关键词堆砌，改用导演执行格式，严格如下：
0-X秒（X为本镜头实际秒数，范围3～8）
时间：日/夜
场景图片：@场景编号或名称
镜头调度：可执行导演指令
表演与动作：使用@角色描述动作与台词
音色：声线、年龄感、语气、强弱、节奏
特效：可执行特效
镜头衔接：与前后镜头连接依据
时长：3秒～8秒

请直接返回提示词文本，不要包含其他解释。`;

    const response = await client.chat({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一位专业的 AI 视频生成提示词专家兼执行导演，擅长将剧本场景转换为可执行的视频生成提示词。你必须输出中文，并包含@场景与@角色引用，镜头调度与镜头衔接都必须可落地执行。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.55,
      max_tokens: 900,
    });

    const videoPrompt = response.choices[0]?.message?.content?.trim();
    if (!videoPrompt) {
      throw new Error('未收到有效响应');
    }

    return NextResponse.json({
      success: true,
      videoPrompt,
      usage: response.usage,
    });
  } catch (error) {
    console.error('Generate video prompt error:', error);

    if (error instanceof DeepSeekError) {
      return NextResponse.json(
        { error: error.message, statusCode: error.statusCode },
        { status: error.statusCode || 500 }
      );
    }

    return NextResponse.json(
      { error: '生成视频提示词失败，请稍后重试' },
      { status: 500 }
    );
  }
}
