# 网页抓图生成提示词 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 prompt-butler 扩展新增「网页图片抓取 → 选提示词模板 → 视觉模型生成多格式提示词」能力，结果同时展示在网页内面板与悬浮窗新增「抓图」标签页。

**Architecture:** content script 新增悬停抓图模块（事件委托 + shadow DOM），把图片 URL 与模板 ID 发给 background；background 用 `fetch` + `OffscreenCanvas` 压缩成 base64（绕过 CORS），按模板拼 system prompt 复用现有视觉模型请求函数，解析出 `promptEn/promptZh/negativePrompt/notes` 四字段，写回抓图历史并返回给 content。模板与历史存 `chrome.storage.local`。

**Tech Stack:** React 18 + TypeScript + Vite，Tailwind 工具类，framer-motion，vitest（新增测试框架），chrome.runtime 消息 / chrome.storage.local，MV3 service worker 的 `OffscreenCanvas`/`createImageBitmap`。

**设计文档：** `docs/superpowers/specs/2026-08-29-web-image-grab-design.md`

**验证命令：** `npm test`（单元测试）、`npm run build`（构建 + 类型检查）

---

## 任务与文件总览

| 任务 | 新增/修改文件 |
|---|---|
| 1 | `package.json`、`vitest.config.ts`、`tests/smoke.test.ts` |
| 2 | `src/types/grab.ts`、`src/types/runtime.ts` |
| 3 | `src/lib/grab-templates.ts`、`tests/grab-templates.test.ts` |
| 4 | `src/lib/grab-result.ts`、`tests/grab-result.test.ts` |
| 5 | `src/lib/grab-library.ts`、`tests/grab-library.test.ts` |
| 6 | `src/background/prompt-generator.ts` |
| 7 | `src/lib/task-broker.ts`、`src/background/image-grab.ts` |
| 8 | `src/background/index.ts` |
| 9 | `src/content/ImageGrabber.tsx` |
| 10 | `src/content/index.tsx` |
| 11 | `src/content/GrabStudio.tsx`、`src/content/OverlayApp.tsx`、`src/lib/prompt-library.ts` |
| 12 | `src/options/TemplateManager.tsx`、`src/options/OptionsApp.tsx` |
| 13 | 全量验证 |

---

## Task 1: 引入 vitest 测试框架

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: 添加 vitest 依赖与测试脚本**

修改 `package.json`：
- `scripts` 增加 `"test": "vitest run"`、`"test:watch": "vitest"`
- `devDependencies` 增加 `"vitest": "^2.1.8"`

安装：`npm install`

- [ ] **Step 2: 创建 vitest 配置**

创建 `vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 3: 创建冒烟测试**

创建 `tests/smoke.test.ts`：

```ts
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test`
Expected: `Test Files  1 passed`，`Tests  1 passed`

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "test: 引入 vitest 测试框架"
```

---

## Task 2: 抓图类型定义

**Files:**
- Create: `src/types/grab.ts`
- Modify: `src/types/runtime.ts`

- [ ] **Step 1: 创建 `src/types/grab.ts`**

```ts
export interface GrabTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  builtIn: boolean;
  updatedAt: string;
}

export interface GrabResult {
  id: string;
  imageUrl: string;
  thumbnail: string;
  templateId: string;
  templateName: string;
  model: string;
  provider: string;
  promptEn: string;
  promptZh: string;
  negativePrompt: string;
  notes: string;
  createdAt: string;
}

export interface GrabGenerationInput {
  imageUrl: string;
  templateId: string;
}

export interface GrabGenerationSuccess {
  ok: true;
  provider: string;
  model: string;
  generatedAt: string;
  result: GrabResult;
}

export interface GrabGenerationFailure {
  ok: false;
  provider: string;
  model: string;
  generatedAt: string;
  message: string;
}

export type GrabGenerationResult = GrabGenerationSuccess | GrabGenerationFailure;
```

- [ ] **Step 2: 在 `src/types/runtime.ts` 注册消息类型**

顶部 import 增加：

```ts
import type { GrabGenerationInput, GrabGenerationResult } from "./grab";
```

在 `CancelImageGenerationMessage` 之后增加：

```ts
export interface GenerateGrabMessage {
  type: "image-grab:generate";
  payload: {
    settings: ExtensionSettings;
    input: GrabGenerationInput;
  };
}
```

`RuntimeRequestMessage` 联合类型追加 `| GenerateGrabMessage`。
`RuntimeResponseMessage` 联合类型追加 `| GrabGenerationResult`。

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add src/types/grab.ts src/types/runtime.ts
git commit -m "feat: 新增抓图功能类型定义"
```

---

## Task 3: 内置模板与输出契约

**Files:**
- Create: `src/lib/grab-templates.ts`
- Create: `tests/grab-templates.test.ts`

- [ ] **Step 1: 写失败测试 `tests/grab-templates.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { BUILTIN_GRAB_TEMPLATES, GRAB_OUTPUT_CONTRACT, buildGrabSystemPrompt } from "../src/lib/grab-templates";

describe("BUILTIN_GRAB_TEMPLATES", () => {
  it("内置 5 套模板，均含必要字段", () => {
    expect(BUILTIN_GRAB_TEMPLATES).toHaveLength(5);
    for (const t of BUILTIN_GRAB_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.prompt.length).toBeGreaterThan(20);
      expect(t.builtIn).toBe(true);
    }
  });

  it("包含 5 个固定 id", () => {
    const ids = BUILTIN_GRAB_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(["detailed", "concise", "photography", "anime", "cinematic"]);
  });
});

describe("buildGrabSystemPrompt", () => {
  it("system prompt 由模板指令 + 输出契约拼接", () => {
    const sp = buildGrabSystemPrompt(BUILTIN_GRAB_TEMPLATES[0]);
    expect(sp).toContain(BUILTIN_GRAB_TEMPLATES[0].prompt);
    expect(sp).toContain("promptEn");
    expect(sp).toContain("negativePrompt");
  });
});

describe("GRAB_OUTPUT_CONTRACT", () => {
  it("包含四个输出字段", () => {
    expect(GRAB_OUTPUT_CONTRACT).toContain("promptEn");
    expect(GRAB_OUTPUT_CONTRACT).toContain("promptZh");
    expect(GRAB_OUTPUT_CONTRACT).toContain("negativePrompt");
    expect(GRAB_OUTPUT_CONTRACT).toContain("notes");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/grab-templates.test.ts`
Expected: FAIL（`Cannot find module ... grab-templates`）

- [ ] **Step 3: 创建 `src/lib/grab-templates.ts`**

```ts
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/grab-templates.test.ts`
Expected: PASS（4 个测试）

- [ ] **Step 5: 提交**

```bash
git add src/lib/grab-templates.ts tests/grab-templates.test.ts
git commit -m "feat: 内置抓图提示词模板与输出契约"
```

---

## Task 4: 多格式结果解析器

**Files:**
- Create: `src/lib/grab-result.ts`
- Create: `tests/grab-result.test.ts`

- [ ] **Step 1: 写失败测试 `tests/grab-result.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { parseGrabResult } from "../src/lib/grab-result";

describe("parseGrabResult", () => {
  it("解析 ```json 代码块", () => {
    const raw = '```json\n{"promptEn":"a cat, cinematic","promptZh":"一只猫","negativePrompt":"blurry","notes":"可爱的猫"}\n```';
    const r = parseGrabResult(raw);
    expect(r.promptEn).toBe("a cat, cinematic");
    expect(r.promptZh).toBe("一只猫");
    expect(r.negativePrompt).toBe("blurry");
    expect(r.notes).toBe("可爱的猫");
  });

  it("解析裸 JSON", () => {
    const raw = '{"promptEn":"night city","promptZh":"夜晚城市","negativePrompt":"lowres","notes":"赛博朋克"}';
    const r = parseGrabResult(raw);
    expect(r.promptEn).toBe("night city");
    expect(r.promptZh).toBe("夜晚城市");
    expect(r.negativePrompt).toBe("lowres");
  });

  it("支持 prompt / negative_prompt / description 别名", () => {
    const raw = '{"prompt":"alias en","negative_prompt":"alias neg","description":"alias notes"}';
    const r = parseGrabResult(raw);
    expect(r.promptEn).toBe("alias en");
    expect(r.negativePrompt).toBe("alias neg");
    expect(r.notes).toBe("alias notes");
  });

  it("JSON 失败时回退文本启发式提取", () => {
    const raw = "正向提示词：sailor moon\n负面提示词：blurry, low quality";
    const r = parseGrabResult(raw);
    expect(r.promptEn).toContain("sailor moon");
    expect(r.negativePrompt).toContain("blurry");
  });

  it("纯文本无标记时取前 500 字符", () => {
    const r = parseGrabResult("just some plain prompt text here");
    expect(r.promptEn).toContain("plain prompt");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/grab-result.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建 `src/lib/grab-result.ts`**

```ts
export interface ParsedGrabOutput {
  promptEn: string;
  promptZh: string;
  negativePrompt: string;
  notes: string;
}

function extractJsonText(rawText: string): string | null {
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return rawText.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

export function parseGrabResult(rawText: string): ParsedGrabOutput {
  const jsonText = extractJsonText(rawText);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

      return {
        promptEn: str(parsed.promptEn) || str(parsed.prompt) || rawText.trim(),
        promptZh: str(parsed.promptZh),
        negativePrompt: str(parsed.negativePrompt) || str(parsed.negative_prompt),
        notes: str(parsed.notes) || str(parsed.description)
      };
    } catch {
      // 解析失败，走文本兜底
    }
  }

  const text = rawText.trim();
  const enMatch = text.match(
    /(?:正向提示词|Prompt|Positive|prompt)[：:]\s*([\s\S]*?)(?=\n\s*(?:负面提示词|Negative|negative|$))/i
  );
  const negMatch = text.match(/(?:负面提示词|Negative|negative)[：:]\s*([\s\S]*?)$/i);

  return {
    promptEn: enMatch ? enMatch[1].trim() : text.slice(0, 500),
    promptZh: "",
    negativePrompt: negMatch ? negMatch[1].trim() : "",
    notes: ""
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/grab-result.test.ts`
Expected: PASS（5 个测试）

- [ ] **Step 5: 提交**

```bash
git add src/lib/grab-result.ts tests/grab-result.test.ts
git commit -m "feat: 抓图结果多格式解析器"
```

---

## Task 5: 抓图存储库（模板 CRUD + 历史）

**Files:**
- Create: `src/lib/grab-library.ts`
- Create: `tests/grab-library.test.ts`

- [ ] **Step 1: 写失败测试 `tests/grab-library.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addGrabResult,
  clearGrabHistory,
  getGrabHistory,
  getGrabTemplates,
  getLastGrabTemplateId,
  removeGrabResult,
  resetGrabTemplates,
  saveGrabTemplates,
  setLastGrabTemplateId
} from "../src/lib/grab-library";
import { BUILTIN_GRAB_TEMPLATES } from "../src/lib/grab-templates";
import type { GrabResult } from "../src/types/grab";

function makeStorageMock() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (keys: string | string[] | null) => {
      if (keys == null) return Object.fromEntries(store);
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) out[k] = store.get(k);
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    }),
    _store: store
  };
}

beforeEach(() => {
  const mock = makeStorageMock();
  vi.stubGlobal("chrome", { storage: { local: mock } });
});

describe("grab-library", () => {
  it("未存储模板时返回内置 5 套", async () => {
    const templates = await getGrabTemplates();
    expect(templates).toHaveLength(5);
    expect(templates[0].id).toBe("detailed");
  });

  it("saveGrabTemplates 后可读回", async () => {
    await saveGrabTemplates([{ ...BUILTIN_GRAB_TEMPLATES[0], name: "改名" }]);
    const templates = await getGrabTemplates();
    expect(templates[0].name).toBe("改名");
  });

  it("resetGrabTemplates 恢复内置", async () => {
    await saveGrabTemplates([{ ...BUILTIN_GRAB_TEMPLATES[0], name: "x" }]);
    await resetGrabTemplates();
    const templates = await getGrabTemplates();
    expect(templates).toHaveLength(5);
    expect(templates[0].name).toBe(BUILTIN_GRAB_TEMPLATES[0].name);
  });

  it("addGrabResult 插入头部并保留最近 20 条", async () => {
    const mk = (n: number): GrabResult => ({
      id: String(n), imageUrl: "", thumbnail: "", templateId: "detailed",
      templateName: "高还原描述", model: "m", provider: "chatgpt",
      promptEn: `p${n}`, promptZh: "", negativePrompt: "", notes: "", createdAt: ""
    });
    for (let i = 0; i < 22; i += 1) await addGrabResult(mk(i));
    const history = await getGrabHistory();
    expect(history).toHaveLength(20);
    expect(history[0].id).toBe("21");
  });

  it("removeGrabResult / clearGrabHistory", async () => {
    await addGrabResult({ id: "a", imageUrl: "", thumbnail: "", templateId: "d", templateName: "t", model: "m", provider: "p", promptEn: "x", promptZh: "", negativePrompt: "", notes: "", createdAt: "" });
    await removeGrabResult("a");
    expect(await getGrabHistory()).toHaveLength(0);
    await addGrabResult({ id: "b", imageUrl: "", thumbnail: "", templateId: "d", templateName: "t", model: "m", provider: "p", promptEn: "y", promptZh: "", negativePrompt: "", notes: "", createdAt: "" });
    await clearGrabHistory();
    expect(await getGrabHistory()).toHaveLength(0);
  });

  it("lastTemplate 默认 detailed，可读写", async () => {
    expect(await getLastGrabTemplateId()).toBe("detailed");
    await setLastGrabTemplateId("anime");
    expect(await getLastGrabTemplateId()).toBe("anime");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/grab-library.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建 `src/lib/grab-library.ts`**

```ts
import { storageGet, storageSet } from "./storage";
import { BUILTIN_GRAB_TEMPLATES } from "./grab-templates";
import type { GrabResult, GrabTemplate } from "../types/grab";

export const GRAB_STORAGE_KEYS = {
  templates: "prompt-butler-grab-templates",
  history: "prompt-butler-grab-history",
  lastTemplate: "prompt-butler-grab-last-template",
  focus: "prompt-butler-grab-focus"
} as const;

const MAX_HISTORY = 20;

export async function getGrabTemplates(): Promise<GrabTemplate[]> {
  const stored = await storageGet<GrabTemplate[]>(GRAB_STORAGE_KEYS.templates, []);
  return stored.length > 0 ? stored : BUILTIN_GRAB_TEMPLATES;
}

export async function ensureGrabTemplates(): Promise<void> {
  const stored = await storageGet<GrabTemplate[]>(GRAB_STORAGE_KEYS.templates, []);
  if (stored.length === 0) {
    await storageSet(GRAB_STORAGE_KEYS.templates, BUILTIN_GRAB_TEMPLATES);
  }
}

export async function saveGrabTemplates(templates: GrabTemplate[]): Promise<void> {
  await storageSet(GRAB_STORAGE_KEYS.templates, templates);
}

export async function resetGrabTemplates(): Promise<GrabTemplate[]> {
  await storageSet(GRAB_STORAGE_KEYS.templates, BUILTIN_GRAB_TEMPLATES);
  return BUILTIN_GRAB_TEMPLATES;
}

export async function getGrabHistory(): Promise<GrabResult[]> {
  return storageGet<GrabResult[]>(GRAB_STORAGE_KEYS.history, []);
}

export async function addGrabResult(result: GrabResult): Promise<GrabResult[]> {
  const history = await getGrabHistory();
  const next = [result, ...history].slice(0, MAX_HISTORY);
  await storageSet(GRAB_STORAGE_KEYS.history, next);
  return next;
}

export async function removeGrabResult(id: string): Promise<GrabResult[]> {
  const history = await getGrabHistory();
  const next = history.filter((item) => item.id !== id);
  await storageSet(GRAB_STORAGE_KEYS.history, next);
  return next;
}

export async function clearGrabHistory(): Promise<GrabResult[]> {
  await storageSet(GRAB_STORAGE_KEYS.history, []);
  return [];
}

export async function getLastGrabTemplateId(): Promise<string> {
  const id = await storageGet<string>(GRAB_STORAGE_KEYS.lastTemplate, "detailed");
  return id || "detailed";
}

export async function setLastGrabTemplateId(id: string): Promise<void> {
  await storageSet(GRAB_STORAGE_KEYS.lastTemplate, id);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/grab-library.test.ts`
Expected: PASS（6 个测试）

- [ ] **Step 5: 提交**

```bash
git add src/lib/grab-library.ts tests/grab-library.test.ts
git commit -m "feat: 抓图模板与历史存储库"
```

---

## Task 6: 通用视觉请求入口

**Files:**
- Modify: `src/background/prompt-generator.ts`

- [ ] **Step 1: 追加导出函数**

在 `src/background/prompt-generator.ts` 末尾追加：

```ts
export interface VisionRequestInput {
  systemPrompt: string;
  userPrompt: string;
  referenceImages?: Array<{ dataUrl: string; name: string }>;
}

export async function runVisionRequest(
  settings: ExtensionSettings,
  input: VisionRequestInput
): Promise<{ model: string; rawText: string }> {
  const model = settings.visionModel;

  if (settings.provider === "claude") {
    return requestWithAnthropic(settings, { ...input, model });
  }

  if (settings.provider === "gemini") {
    return requestWithGemini(settings, { ...input, model });
  }

  return requestWithOpenAiCompatible(settings, { ...input, model });
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
git add src/background/prompt-generator.ts
git commit -m "feat: 新增通用视觉模型请求入口"
```

---

## Task 7: 后台抓图生成 + 任务桥

**Files:**
- Modify: `src/lib/task-broker.ts`
- Create: `src/background/image-grab.ts`

- [ ] **Step 1: 在 `src/lib/task-broker.ts` 增加抓图任务**

文件顶部 import 增加：

```ts
import type { GrabGenerationResult } from "../types/grab";
```

在 `idlePromptTask` 之后增加：

```ts
const GRAB_TASK_KEY = "prompt-butler-grab-task";

export type GrabTaskState = TaskState<GrabGenerationResult>;

const idleGrabTask: GrabTaskState = { status: "idle", startedAt: null, result: null };

export async function startGrabTask() {
  await storageSet(GRAB_TASK_KEY, {
    status: "running",
    startedAt: new Date().toISOString(),
    result: null
  } satisfies GrabTaskState);
}

export async function finishGrabTask(result: GrabGenerationResult) {
  await storageSet(GRAB_TASK_KEY, {
    status: "done",
    startedAt: null,
    result
  } satisfies GrabTaskState);
}

export async function getGrabTask(): Promise<GrabTaskState> {
  return storageGet<GrabTaskState>(GRAB_TASK_KEY, idleGrabTask);
}

export async function clearGrabTask() {
  await storageSet(GRAB_TASK_KEY, idleGrabTask);
}
```

- [ ] **Step 2: 创建 `src/background/image-grab.ts`**

```ts
import { getGrabTemplates } from "../lib/grab-library";
import { parseGrabResult } from "../lib/grab-result";
import { buildGrabSystemPrompt } from "../lib/grab-templates";
import type { ExtensionSettings } from "../types/settings";
import type { GrabGenerationResult, GrabResult } from "../types/grab";
import { runVisionRequest } from "./prompt-generator";

const MAX_IMAGE_SIZE = 1024;
const THUMBNAIL_SIZE = 240;
const IMAGE_QUALITY = 0.85;
const FETCH_TIMEOUT_MS = 30000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片编码失败。"));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(imageUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`图片加载失败（HTTP ${response.status}）。`);
    }

    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } finally {
    clearTimeout(timer);
  }
}

async function resizeImage(dataUrl: string, maxSize: number, quality: number): Promise<string> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("当前浏览器不支持图片压缩。");
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const outBlob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return await blobToDataUrl(outBlob);
}

export async function generateGrabPrompt(
  settings: ExtensionSettings,
  imageUrl: string,
  templateId: string
): Promise<GrabGenerationResult> {
  const generatedAt = new Date().toISOString();

  if (!settings.apiKey.trim() || !settings.visionModel.trim()) {
    return {
      ok: false,
      provider: settings.provider,
      model: settings.visionModel,
      generatedAt,
      message: "尚未配置 API Key 或视觉模型，请先到配置中心完成设置。"
    };
  }

  try {
    const templates = await getGrabTemplates();
    const template = templates.find((item) => item.id === templateId) ?? templates[0];

    const source = imageUrl.startsWith("data:")
      ? imageUrl
      : await fetchImageAsDataUrl(imageUrl);
    const compressed = await resizeImage(source, MAX_IMAGE_SIZE, IMAGE_QUALITY);
    const thumbnail = await resizeImage(source, THUMBNAIL_SIZE, 0.7);

    const { model, rawText } = await runVisionRequest(settings, {
      systemPrompt: buildGrabSystemPrompt(template),
      userPrompt: "请分析这张图片，严格按照要求输出提示词。",
      referenceImages: [{ dataUrl: compressed, name: "grabbed-image" }]
    });

    const parsed = parseGrabResult(rawText);
    const result: GrabResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      imageUrl,
      thumbnail,
      templateId: template.id,
      templateName: template.name,
      model,
      provider: settings.provider,
      promptEn: parsed.promptEn,
      promptZh: parsed.promptZh,
      negativePrompt: parsed.negativePrompt,
      notes: parsed.notes,
      createdAt: generatedAt
    };

    return {
      ok: true,
      provider: settings.provider,
      model,
      generatedAt,
      result
    };
  } catch (error) {
    return {
      ok: false,
      provider: settings.provider,
      model: settings.visionModel,
      generatedAt,
      message: error instanceof Error ? error.message : "抓图生成失败。"
    };
  }
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add src/lib/task-broker.ts src/background/image-grab.ts
git commit -m "feat: 后台抓图生成与长任务桥"
```

---

## Task 8: 后台消息路由 + 模板种子

**Files:**
- Modify: `src/background/index.ts`

- [ ] **Step 1: 更新 import**

`src/background/index.ts` 顶部 import 改为（在现有 import 后追加）：

```ts
import { generateGrabPrompt } from "./image-grab";
import { addGrabResult, ensureGrabTemplates } from "../lib/grab-library";
import { clearGrabTask, finishGrabTask, startGrabTask } from "../lib/task-broker";
```

- [ ] **Step 2: 启动时确保模板种子**

在 `chrome.runtime.onInstalled.addListener` 内（`void tryImportSeedPrompts();` 之后）增加：

```ts
void ensureGrabTemplates();
```

在文件末尾（`void tryImportSeedPrompts();` 旁边）也增加一行，覆盖已安装场景：

```ts
void ensureGrabTemplates();
```

- [ ] **Step 3: 注册 `image-grab:generate` 消息处理**

在 `onMessage` 的 `image:download` 分支之后、`open-options-page` 之前插入：

```ts
if (message.type === "image-grab:generate") {
  await startGrabTask();
  const result = await generateGrabPrompt(
    message.payload.settings,
    message.payload.input.imageUrl,
    message.payload.input.templateId
  );
  await finishGrabTask(result);
  if (result.ok) {
    await addGrabResult(result.result);
  }
  sendResponse(result);
  return;
}
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npm run build`
Expected: 构建成功无报错

- [ ] **Step 5: 提交**

```bash
git add src/background/index.ts
git commit -m "feat: 注册抓图生成消息与模板种子导入"
```

---

## Task 9: 网页悬停抓图组件

**Files:**
- Create: `src/content/ImageGrabber.tsx`

- [ ] **Step 1: 创建组件**

```tsx
import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle, Settings, X } from "lucide-react";

import { useExtensionSettings } from "../hooks/useExtensionSettings";
import { getGrabTemplates, setLastGrabTemplateId } from "../lib/grab-library";
import { getGrabTask, clearGrabTask } from "../lib/task-broker";
import { sendRuntimeMessageLong } from "../lib/runtime";
import type { GrabGenerationResult, GrabResult, GrabTemplate } from "../types/grab";

const MIN_SIZE = 80;

interface HoverTarget {
  img: HTMLImageElement;
  rect: DOMRect;
}

type PanelState =
  | { status: "idle" }
  | { status: "loading"; imageUrl: string; templateName: string }
  | { status: "success"; result: GrabResult }
  | { status: "error"; message: string; imageUrl: string; templateId: string };

function isGrabbable(img: HTMLImageElement): boolean {
  if (!img.src) return false;
  if (img.complete && (img.naturalWidth < MIN_SIZE || img.naturalHeight < MIN_SIZE)) return false;
  if (img.naturalWidth === 0 && img.offsetWidth < MIN_SIZE) return false;
  return img.offsetWidth >= MIN_SIZE && img.offsetHeight >= MIN_SIZE;
}

export function ImageGrabber() {
  const { settings } = useExtensionSettings();
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [templates, setTemplates] = useState<GrabTemplate[]>([]);
  const [panel, setPanel] = useState<PanelState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const hostRef = useRef<HTMLDivElement | null>(null);
  const hoveredRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    void getGrabTemplates().then(setTemplates);
  }, []);

  useEffect(() => {
    const isInsideHost = (event: Event) =>
      hostRef.current && event.composedPath().includes(hostRef.current);

    const onMouseOver = (event: MouseEvent) => {
      if (isInsideHost(event)) return;
      const target = event.target as HTMLElement | null;
      const img = target?.closest?.("img") as HTMLImageElement | null;
      if (!img || !isGrabbable(img)) {
        hoveredRef.current = null;
        setHover(null);
        setMenuOpen(false);
        return;
      }
      if (hoveredRef.current === img) return;
      hoveredRef.current = img;
      setHover({ img, rect: img.getBoundingClientRect() });
    };

    const updatePosition = () => {
      if (!hoveredRef.current || rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const img = hoveredRef.current;
        if (img && img.isConnected) {
          setHover((prev) => (prev ? { img, rect: img.getBoundingClientRect() } : prev));
        } else {
          hoveredRef.current = null;
          setHover(null);
        }
      });
    };

    document.addEventListener("mouseover", onMouseOver, true);
    window.addEventListener("scroll", updatePosition, { passive: true, capture: true });
    window.addEventListener("resize", updatePosition, { passive: true });

    return () => {
      document.removeEventListener("mouseover", onMouseOver, true);
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleSelectTemplate = async (template: GrabTemplate, imageUrl: string) => {
    setMenuOpen(false);
    setHover(null);
    setPanel({ status: "loading", imageUrl, templateName: template.name });
    await setLastGrabTemplateId(template.id);

    try {
      const result = await sendRuntimeMessageLong<GrabGenerationResult>(
        {
          type: "image-grab:generate",
          payload: {
            settings,
            input: { imageUrl, templateId: template.id }
          }
        },
        async () => {
          const task = await getGrabTask();
          if (task.status === "done" && task.result) {
            void clearGrabTask();
            return task.result;
          }
          return null;
        }
      );

      if (result.ok) {
        setPanel({ status: "success", result: result.result });
      } else {
        setPanel({
          status: "error",
          message: result.message,
          imageUrl,
          templateId: template.id
        });
      }
    } catch (error) {
      await clearGrabTask();
      setPanel({
        status: "error",
        message: error instanceof Error ? error.message : "生成失败。",
        imageUrl,
        templateId: template.id
      });
    }
  };

  const handleOpenGrabStudio = () => {
    chrome.runtime.sendMessage({ type: "overlay:open", focus: "grab" });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪贴板失败
    }
  };

  const tab = (label: string, text: string) => (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
      <span className="shrink-0 text-xs text-white/55">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-xs text-white/80">{text}</span>
      <button
        type="button"
        onClick={() => void handleCopy(text)}
        className="shrink-0 rounded-lg border border-white/10 bg-black/30 p-1.5 text-white/60 transition hover:border-accent/40 hover:text-accent"
        title="复制"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );

  return (
    <div ref={hostRef} className="fixed inset-0 z-[2147483646] pointer-events-none">
      {hover ? (
        <div
          className="pointer-events-auto fixed z-10"
          style={{
            left: hover.rect.left + 6,
            top: hover.rect.top + 6
          }}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-full border border-accent/50 bg-black/80 px-3 py-1.5 text-xs font-medium text-accent shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur transition hover:bg-black/90"
          >
            抓取生成
          </button>
          {menuOpen ? (
            <div className="mt-1 max-h-72 w-52 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => void handleSelectTemplate(template, hover.img.currentSrc || hover.img.src)}
                  className="block w-full rounded-xl px-3 py-2 text-left transition hover:bg-accent/15"
                >
                  <div className="text-xs font-medium text-white/90">{template.name}</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-white/45">{template.description}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {panel.status !== "idle" ? (
        <div className="pointer-events-auto fixed bottom-4 right-4 z-20 w-80 max-w-[calc(100vw-2rem)]">
          {panel.status === "loading" ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" />
                AI 正在分析图片（{panel.templateName}）...
              </div>
            </div>
          ) : null}

          {panel.status === "error" ? (
            <div className="rounded-2xl border border-rose-400/30 bg-slate-950/95 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm leading-6 text-rose-200">{panel.message}</div>
                <button
                  type="button"
                  onClick={() => setPanel({ status: "idle" })}
                  className="shrink-0 rounded-lg p-1 text-white/50 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          {panel.status === "success" ? (
            <div className="rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <img
                  src={panel.result.thumbnail}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-xl border border-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white/90">{panel.result.templateName}</div>
                  <div className="mt-0.5 text-[11px] text-white/40">{panel.result.notes || "已生成"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel({ status: "idle" })}
                  className="shrink-0 rounded-lg p-1 text-white/50 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 space-y-1.5">
                {tab("英文", panel.result.promptEn)}
                {tab("中文", panel.result.promptZh || "—")}
                {tab("负面", panel.result.negativePrompt || "—")}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleOpenGrabStudio}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-accent transition hover:bg-accent/20"
                >
                  <Settings className="h-3 w-3" />
                  打开抓图页
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopy(panel.result.promptEn)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white/70 transition hover:text-white"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "已复制" : "复制英文"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 3: 提交**

```bash
git add src/content/ImageGrabber.tsx
git commit -m "feat: 网页悬停抓图组件（按钮/模板菜单/结果面板）"
```

---

## Task 10: 挂载抓图组件 + 打开抓图页信号

**Files:**
- Modify: `src/content/index.tsx`

- [ ] **Step 1: 更新 import**

`src/content/index.tsx` 顶部改为：

```tsx
import React from "react";
import { createRoot } from "react-dom/client";

import { OverlayApp } from "./OverlayApp";
import { ImageGrabber } from "./ImageGrabber";
import { GRAB_STORAGE_KEYS } from "../lib/grab-library";
import { storageSet } from "../lib/storage";
import contentStyles from "../styles/tailwind.css?inline";

const CONTAINER_ID = "prompt-butler-root";
const GRAB_CONTAINER_ID = "prompt-butler-grabber-root";
const STYLE_ELEMENT_ID = "prompt-butler-style";
```

- [ ] **Step 2: 新增通用挂载函数与 grabber 挂载**

把 `mount()` 重构为可复用，并在文件末尾追加挂载 grabber 的调用。具体改动：

将 `mount` 改为接受 containerId 与子组件：

```tsx
function mount(containerId: string, app: React.ReactNode) {
  const existingContainer = document.getElementById(containerId);

  if (existingContainer) {
    existingContainer.style.display = "block";
    return existingContainer;
  }

  const container = document.createElement("div");
  container.id = containerId;
  const shadowRoot = container.attachShadow({ mode: "open" });
  const appRoot = document.createElement("div");
  document.body.appendChild(container);
  ensureShadowStyles(shadowRoot);
  shadowRoot.appendChild(appRoot);

  createRoot(appRoot).render(
    <React.StrictMode>{app}</React.StrictMode>
  );

  return container;
}
```

`onMessage` 处理改为（注意 `mount` 调用点与 grab 聚焦信号）：

```tsx
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "overlay:open") {
    mount(CONTAINER_ID, <OverlayApp />);

    if (message.focus === "grab") {
      void storageSet(GRAB_STORAGE_KEYS.focus, new Date().toISOString());
    }

    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// 抓图悬停检测始终挂载
mount(GRAB_CONTAINER_ID, <ImageGrabber />);
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add src/content/index.tsx
git commit -m "feat: 挂载网页抓图组件并支持打开抓图页信号"
```

---

## Task 11: 悬浮窗「抓图」标签页

**Files:**
- Create: `src/content/GrabStudio.tsx`
- Modify: `src/content/OverlayApp.tsx`
- Modify: `src/lib/prompt-library.ts`

- [ ] **Step 1: 在 `src/lib/prompt-library.ts` 注册「抓图」标签**

`DEFAULT_PROMPT_TABS` 改为：

```ts
export const DEFAULT_PROMPT_TABS = [
  "角色设定",
  "抓图",
  "图像生成",
  "收藏",
  "Nano精修",
  "AI视频运镜",
  "3D建模",
  "电商详情页"
] as const;
```

`CORE_TABS` 改为：

```ts
export const CORE_TABS: readonly string[] = ["角色设定", "抓图", "图像生成", "收藏"];
```

- [ ] **Step 2: 创建 `src/content/GrabStudio.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Save, Trash2 } from "lucide-react";

import { useChromeStorage } from "../hooks/useChromeStorage";
import {
  clearGrabHistory,
  GRAB_STORAGE_KEYS,
  getGrabTemplates,
  getLastGrabTemplateId,
  removeGrabResult,
  setLastGrabTemplateId
} from "../lib/grab-library";
import { saveImageWorkspacePrompt } from "../lib/image-library";
import { savePromptToFavorites } from "../lib/prompt-library";
import { showToast } from "../lib/toast";
import type { GrabResult, GrabTemplate } from "../types/grab";
import type { ProviderId } from "../types/settings";

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function GrabStudio() {
  const historyStorage = useChromeStorage<GrabResult[]>(GRAB_STORAGE_KEYS.history, []);
  const [templates, setTemplates] = useState<GrabTemplate[]>([]);
  const [lastTemplateId, setLastTemplateIdState] = useState("detailed");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { value: history, setValue: setHistory } = historyStorage;

  useEffect(() => {
    void getGrabTemplates().then(setTemplates);
    void getLastGrabTemplateId().then(setLastTemplateIdState);
  }, []);

  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
    } catch {
      showToast("复制失败，请手动复制。");
    }
  };

  const handleSyncToImageGen = async (result: GrabResult) => {
    if (!result.promptEn) return;
    await saveImageWorkspacePrompt(result.promptEn);
    showToast("已同步到生图区~");
  };

  const handleFavorite = async (result: GrabResult) => {
    if (!result.promptEn) return;
    await savePromptToFavorites({
      provider: result.provider as ProviderId,
      model: result.model,
      format: "enPrompt",
      content: result.promptEn,
      title: result.notes || result.templateName
    });
    showToast("已收藏到收藏夹~");
  };

  const handleDelete = async (id: string) => {
    const next = await removeGrabResult(id);
    await setHistory(next);
  };

  const handleClear = async () => {
    await clearGrabHistory();
    await setHistory([]);
  };

  const handleTemplateChange = async (id: string) => {
    setLastTemplateIdState(id);
    await setLastGrabTemplateId(id);
  };

  const resultTabs = useMemo(() => {
    const items = (result: GrabResult) => [
      { key: "en", label: "英文", text: result.promptEn },
      { key: "zh", label: "中文", text: result.promptZh || "—" },
      { key: "neg", label: "负面", text: result.negativePrompt || "—" },
      { key: "json", label: "JSON", text: JSON.stringify({ promptEn: result.promptEn, promptZh: result.promptZh, negativePrompt: result.negativePrompt, notes: result.notes }, null, 2) }
    ];
    return { items };
  }, []);

  return (
    <div className="space-y-4">
      <section className="glass-card p-4">
        <div className="section-label">网页抓图</div>
        <div className="section-hint">
          悬停任意网页图片，点击「抓取生成」即可按模板生成提示词
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/45">默认模板</span>
          <select
            value={lastTemplateId}
            onChange={(event) => void handleTemplateChange(event.target.value)}
            className="form-field w-auto rounded-xl px-3 py-2 text-xs"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id} className="bg-slate-950 text-white">
                {template.name}
              </option>
            ))}
          </select>
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleClear()}
              className="ghost-button ml-auto rounded-xl px-3 py-2 text-xs"
            >
              清空记录
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-1.5">
        {history.length === 0 ? (
          <div className="glass-card border-dashed px-4 py-8 text-center text-sm leading-6 text-white/45">
            暂无抓图记录。打开任意网页，悬停图片点击「抓取生成」即可。
          </div>
        ) : null}

        {history.map((result) => {
          const isExpanded = expandedId === result.id;
          const tabs = resultTabs.items(result);

          return (
            <article key={result.id} className="media-card transition">
              <div className="flex items-center gap-3 px-3 py-2">
                <img
                  src={result.thumbnail}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-white/85">
                    {result.templateName}
                  </div>
                  <div className="mt-0.5 text-[10px] text-white/40">
                    {result.model} · {formatTime(result.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : result.id)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/58 transition hover:border-accent/30 hover:text-white"
                >
                  {isExpanded ? "收起" : "展开"}
                </button>
              </div>

              {isExpanded ? (
                <div className="space-y-3 border-t border-white/5 px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(result.id, result.promptEn)}
                      className="ghost-button rounded-xl px-3 py-2 text-xs"
                    >
                      {copiedId === result.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedId === result.id ? "已复制" : "复制英文"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSyncToImageGen(result)}
                      className="gradient-button rounded-xl px-3 py-2 text-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      同步到生图区
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFavorite(result)}
                      className="ghost-button rounded-xl px-3 py-2 text-xs"
                    >
                      <Save className="h-3.5 w-3.5" />
                      收藏
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(result.id)}
                      className="ghost-button rounded-xl px-3 py-2 text-xs text-rose-300 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>

                  <div className="space-y-2">
                    {tabs.map((item) => (
                      <div key={item.key}>
                        <div className="mb-1 text-[11px] text-white/40">{item.label}</div>
                        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/75">
                          {item.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: 在 `src/content/OverlayApp.tsx` 注册标签与聚焦**

Import 增加：

```tsx
import { GrabStudio } from "./GrabStudio";
import { GRAB_STORAGE_KEYS } from "../lib/grab-library";
import { storageSet } from "../lib/storage";
```

`libraryTabs` 过滤增加「抓图」：

```tsx
const libraryTabs = visibleTabs.filter(
  (tab) => tab !== "角色设定" && tab !== "图像生成" && tab !== "抓图"
);
```

新增聚焦 effect（放在 `cleanupInvalidTabs` effect 之后）：

```tsx
const grabFocus = useChromeStorage<string | null>(GRAB_STORAGE_KEYS.focus, null);

useEffect(() => {
  if (grabFocus.value) {
    setActiveTab("抓图");
    void storageSet(GRAB_STORAGE_KEYS.focus, null);
  }
}, [grabFocus.value]);
```

渲染分支增加（在 `activeTab === "角色设定"` 之前）：

```tsx
) : activeTab === "抓图" ? (
  <GrabStudio />
) : activeTab === "角色设定" ? (
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 5: 提交**

```bash
git add src/content/GrabStudio.tsx src/content/OverlayApp.tsx src/lib/prompt-library.ts
git commit -m "feat: 悬浮窗新增抓图标签页"
```

---

## Task 12: 配置中心模板管理

**Files:**
- Create: `src/options/TemplateManager.tsx`
- Modify: `src/options/OptionsApp.tsx`

- [ ] **Step 1: 创建 `src/options/TemplateManager.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { getGrabTemplates, resetGrabTemplates, saveGrabTemplates } from "../lib/grab-library";
import type { GrabTemplate } from "../types/grab";

const EMPTY_PROMPT = "请编写你的图片分析指令，模型会按固定 JSON 契约返回 promptEn/promptZh/negativePrompt/notes。";

export function TemplateManager() {
  const [templates, setTemplates] = useState<GrabTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void getGrabTemplates().then((list) => {
      setTemplates(list);
      setDrafts(Object.fromEntries(list.map((t) => [t.id, t.prompt])));
      setIsLoading(false);
    });
  }, []);

  const updateDraft = (id: string, value: string) => {
    setDrafts((current) => ({ ...current, [id]: value }));
  };

  const handleSave = async () => {
    const next = templates.map((template) => ({
      ...template,
      prompt: drafts[template.id] ?? template.prompt,
      updatedAt: new Date().toISOString()
    }));
    await saveGrabTemplates(next);
    setTemplates(next);
    setMessage("模板已保存。");
  };

  const handleAdd = () => {
    const now = new Date().toISOString();
    const id = `custom-${Date.now().toString(36)}`;
    const template: GrabTemplate = {
      id,
      name: "自定义模板",
      description: "自定义模板",
      prompt: EMPTY_PROMPT,
      builtIn: false,
      updatedAt: now
    };
    setTemplates((current) => [...current, template]);
    setDrafts((current) => ({ ...current, [id]: template.prompt }));
  };

  const handleDelete = async (id: string) => {
    const next = templates.filter((template) => template.id !== id);
    await saveGrabTemplates(next);
    setTemplates(next);
    setMessage("自定义模板已删除。");
  };

  const handleReset = async () => {
    const list = await resetGrabTemplates();
    setTemplates(list);
    setDrafts(Object.fromEntries(list.map((t) => [t.id, t.prompt])));
    setMessage("已恢复为内置模板。");
  };

  if (isLoading) {
    return <div className="text-sm text-white/50">正在加载模板...</div>;
  }

  return (
    <div className="glass-card p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.26em] text-white/40">Grab Templates</div>
          <h2 className="mt-1 text-xl font-semibold text-white">网页抓图提示词模板</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            悬停网页图片时按模板指令分析图片，模型始终按固定 JSON 契约返回英文/中文/负面/概括四字段。
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void handleAdd()} className="gradient-button">
            <Plus className="h-4 w-4" />
            新增模板
          </button>
          <button type="button" onClick={() => void handleReset()} className="ghost-button">
            <RotateCcw className="h-4 w-4" />
            恢复默认
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {templates.map((template) => (
          <article key={template.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={template.name}
                onChange={(event) => {
                  setTemplates((current) =>
                    current.map((t) => (t.id === template.id ? { ...t, name: event.target.value } : t))
                  );
                }}
                className="form-field w-44 rounded-xl px-3 py-2 text-sm"
              />
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">
                {template.builtIn ? "内置" : "自定义"}
              </span>
              <div className="ml-auto flex gap-2">
                {!template.builtIn ? (
                  <button
                    type="button"
                    onClick={() => void handleDelete(template.id)}
                    className="ghost-button rounded-xl px-3 py-2 text-xs text-rose-300 hover:text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    删除
                  </button>
                ) : null}
              </div>
            </div>
            <input
              type="text"
              value={template.description}
              onChange={(event) => {
                setTemplates((current) =>
                  current.map((t) => (t.id === template.id ? { ...t, description: event.target.value } : t))
                );
              }}
              placeholder="模板说明"
              className="form-field mt-3 rounded-xl px-3 py-2 text-xs"
            />
            <textarea
              value={drafts[template.id] ?? template.prompt}
              onChange={(event) => updateDraft(template.id, event.target.value)}
              placeholder="编写图片分析指令"
              className="form-field mt-3 min-h-[120px] w-full resize-y rounded-xl px-3 py-2 text-xs leading-5"
            />
          </article>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button type="button" onClick={() => void handleSave()} className="gradient-button">
          <Save className="h-4 w-4" />
          保存模板
        </button>
        {message ? <span className="text-sm text-accent/80">{message}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 `src/options/OptionsApp.tsx` 挂载**

Import 增加：

```tsx
import { TemplateManager } from "./TemplateManager";
```

在 `<main>` 内部、`</motion.div>` 之前（`</section>` 网格之后）追加：

```tsx
<section className="space-y-6">
  <TemplateManager />
</section>
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错

- [ ] **Step 4: 提交**

```bash
git add src/options/TemplateManager.tsx src/options/OptionsApp.tsx
git commit -m "feat: 配置中心新增抓图模板管理"
```

---

## Task 13: 全量验证

**Files:**
- 无新增

- [ ] **Step 1: 单元测试**

Run: `npm test`
Expected: 所有测试通过（smoke + grab-templates + grab-result + grab-library）

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: `tsc --noEmit` 无报错，vite build 成功

- [ ] **Step 3: 手动验证清单**

在 Chrome `chrome://extensions` 加载 `dist`，逐项验证：
1. 打开含多图的网页，悬停图片出现「抓取生成」按钮
2. 点按钮弹出模板菜单，选模板 → 右下角出现分析中面板
3. 生成成功后面板展示缩略图 + 四字段，可复制
4. 点「打开抓图页」→ 悬浮窗出现并切到「抓图」标签，历史可见
5. 抓图页「同步到生图区」→ 生图区 prompt 已更新
6. 配置中心「网页抓图提示词模板」可编辑/新增/删除/恢复默认
7. 跨域图（如 unsplash.com 图片）与普通图各测一次

- [ ] **Step 4: 提交（若有手工修复）**

```bash
git add -A
git commit -m "fix: 抓图功能手动验证修复"
```

---

## 自检记录

- **Spec 覆盖**：悬停按钮（Task 9/10）、选模板直接生成（Task 7/8/9）、多格式输出（Task 4）、内置 5 套 + 自定义（Task 3/5/12）、悬浮窗抓图页（Task 11）、网页内面板（Task 9）、跨域压缩（Task 7）、错误处理（Task 7/9/11）、验证（Task 13）——全部覆盖。
- **类型一致性**：`GrabTemplate`/`GrabResult`/`GrabGenerationResult` 在 Task 2 定义，Task 3/5/7/9/11/12 引用一致；`GRAB_STORAGE_KEYS` 在 Task 5 定义，Task 8/10/11 引用一致；`runVisionRequest`（Task 6）被 Task 7 使用；`startGrabTask/finishGrabTask/getGrabTask/clearGrabTask`（Task 7）被 Task 8/9 使用。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整实现。
