import type { GrabTemplate } from "../types/grab";

export const GRAB_OUTPUT_CONTRACT = `仅输出以下 JSON，禁止添加任何说明文字、标题或 Markdown：
{
  "promptEn": "English prompt, comma-separated keywords ordered by importance",
  "promptZh": "中文提示词，关键词逗号分隔，与英文一一对应",
  "negativePrompt": "English negative prompt, comma-separated",
  "notes": "一句中文概括图片整体印象（20字以内）"
}`;

const now = () => new Date().toISOString();

export const BUILTIN_GRAB_TEMPLATES: GrabTemplate[] = [
  {
    id: "detailed",
    name: "高还原描述",
    description: "逐层拆解原图，最大程度还原画面",
    builtIn: true,
    updatedAt: now(),
    prompt: `你是一名专业的 AI 绘画提示词工程师。请像"逆向工程"一样极其精确地分析这张图片，目标是让其他 AI 模型（Midjourney / Stable Diffusion / DALL·E）能够高度还原这张原图。

请按顺序逐项描述，用词精准，不遗漏任何视觉细节：

1. 【主体与构图】画面中心主体是什么（人/物/场景），几何位置，镜头视角，画幅比例。
2. 【人物/主体细节】性别、年龄感、发色发型、五官、服装款式颜色材质、姿势表情（无人物则描述主体物体）。
3. 【光线与阴影】光源类型与方向、阴影形态、高光位置与材质反射。
4. 【色彩系统】主色调（2~3 个精确英文色名）、整体色温、饱和度对比度、配色关系。
5. 【背景与环境】背景内容、虚化程度、时间段、天气、地点。
6. 【艺术风格与质感】整体风格（超写实摄影/数字绘画/油画/水彩/3D渲染等）、渲染质量关键词、特殊效果。
7. 【负面提示词】列出应避免的元素（多余肢体、模糊、低质量、错误比例等）。`
  },
  {
    id: "concise",
    name: "精简还原",
    description: "用最少的词精准还原画面核心",
    builtIn: true,
    updatedAt: now(),
    prompt: `你是专业的 AI 绘画提示词工程师。分析这张图片，提取能够还原原图的最核心关键词。

要求：
- 提示词控制在 40~60 个英文词以内
- 严格按权重排序：主体 > 风格 > 光线 > 色调 > 质量词
- 每个词必须精准对应图中可见元素，不添加图中没有的内容
- 质量词放在末尾（如 8k, ultra detailed, masterpiece）`
  },
  {
    id: "photography",
    name: "摄影还原",
    description: "以摄影参数精准还原真实感",
    builtIn: true,
    updatedAt: now(),
    prompt: `你是一名专业摄影师兼 AI 提示词专家。请分析这张图片，以专业摄影参数描述，目标是让 AI 生成与原图在真实感、光线、构图上高度一致的照片。

请精确提取：
1. 【摄影参数】相机品牌/机型感、镜头焦段、光圈、快门效果、ISO 感。
2. 【光线还原】光源类型与方向、高光与阴影细节、皮肤/材质在该光线下的呈现。
3. 【构图与景深】景深范围、构图规则、前中后景关系。
4. 【色彩还原】相机直出色调或后期调色风格、精确色温。`
  },
  {
    id: "anime",
    name: "动漫还原",
    description: "精准还原动漫/插画原图风格",
    builtIn: true,
    updatedAt: now(),
    prompt: `你是专业动漫插画风格提示词专家。分析这张图片，提取能让 AI 高度还原其动漫/插画风格的所有关键词。

请精确描述：
1. 【画风识别】具体画风流派（KyoAni/新海诚/吉卜力/赛璐璐/厚涂/水彩插画等）、线条特征、上色技法。
2. 【角色细节】发色（精确色名）、发型、眼睛（颜色/瞳孔/高光）、服装（款式/颜色/配件/花纹）、表情情绪。
3. 【色彩与光影】分层阴影、发光/光晕特效、整体色调。
4. 【背景与氛围】背景风格、特效元素（花瓣/光粒子/魔法阵等）。
5. 【负面提示词】包含 low quality, bad anatomy, extra fingers, blurry, watermark, realistic photo。`
  },
  {
    id: "cinematic",
    name: "电影感还原",
    description: "还原电影镜头级别的画面质感",
    builtIn: true,
    updatedAt: now(),
    prompt: `你是专业电影摄影师与 AI 提示词专家。分析这张图片的电影视觉语言，目标是生成能让 AI 高度还原其电影质感的提示词。

请精确分析：
1. 【镜头语言】景别、镜头类型、拍摄角度。
2. 【电影调色】调色风格（Teal & Orange/冷蓝暗调/暖棕胶片等）、阴影与高光颜色、参考电影风格。
3. 【光线与氛围】光源、大气效果（体积光/雾/烟/尘埃）。
4. 【胶片质感】胶片颗粒、色差、镜头光斑、画幅黑边。
5. 【场景与叙事感】时间、环境细节。
6. 【负面提示词】`
  }
];

export function buildGrabSystemPrompt(template: GrabTemplate): string {
  return [template.prompt, GRAB_OUTPUT_CONTRACT].join("\n\n");
}
