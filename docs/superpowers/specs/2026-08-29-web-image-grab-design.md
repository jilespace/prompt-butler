# 网页抓图生成提示词 · 设计文档

日期：2026-08-29
状态：已评审通过
关联项目：prompt-butler（提示词生成管家，Chrome MV3 扩展）

## 1. 背景与目标

参考项目 `E:\AIcodeing\browser\Image2Prompt`，为本扩展新增「网页图片抓取 → 选提示词模板 → 视觉模型生成多格式提示词」能力，深度整合进现有架构（复用同一套服务商配置、视觉模型调用链路、悬浮窗与暗黑毛玻璃 UI）。

目标能力：
- 悬停网页 `<img>` 出现抓取按钮，点选模板后直接生成
- 多格式输出：英文提示词 + 中文提示词 + 负面提示词 + 结构化 JSON
- 内置 5 套模板 + 配置中心可自定义管理模板
- 结果同时展示在「网页内结果面板」与悬浮窗新增的「抓图」标签页
- 跨域图片无需 CORS 头也能抓取（后台 OffscreenCanvas 压缩）

## 2. 整体架构与数据流

新增后台消息 `image-grab:generate`：

```
content（悬停按钮选模板）
  → sendRuntimeMessageLong { imageUrl, templateId, settings }
  → background：
      1. fetch 图片 → OffscreenCanvas 压缩 ≤1024px JPEG(base64)
      2. 按模板拼 system prompt（模板指令 + 固定输出契约）
      3. 调用现有视觉模型（requestWithOpenAiCompatible / Anthropic / Gemini）
      4. 解析多格式结果 { promptEn, promptZh, negativePrompt, notes }
  → 写回 storage（抓图历史）
  → content 弹网页内结果面板 + 悬浮窗「抓图」页同步显示
```

要点：
- 抓图与压缩在 background 完成，使用 `OffscreenCanvas`（service worker 可用 2D 上下文），配合 host_permissions 的 `<all_urls>` 绕过 CORS，跨域图也能抓
- 复用现有 `settings`（provider / apiKey / visionModel），不引入第二套配置
- 复用 `task-broker` 长任务 + 轮询模式（与 `prompt:generate` / `image:generate` 一致），后台休眠也能取回结果
- 模板存储：`chrome.storage.local` key `prompt-butler-grab-templates`
- 抓图历史存储：`chrome.storage.local` key `prompt-butler-grab-history`

## 3. 模块与文件划分

### 新增文件

| 文件 | 职责 |
|---|---|
| `src/types/grab.ts` | `GrabTemplate`、`GrabResult`、抓图消息类型 |
| `src/lib/grab-templates.ts` | 内置 5 套模板常量（detailed/concise/photography/anime/cinematic） |
| `src/lib/grab-library.ts` | 模板 CRUD + 抓图历史读写（chrome.storage.local 封装） |
| `src/background/image-grab.ts` | fetch 图片 → OffscreenCanvas 压缩 → 按模板调视觉模型 → 解析多格式结果 |
| `src/content/ImageGrabber.tsx` | 网页图片悬停检测（事件委托）、悬停按钮、模板菜单、网页内结果面板（shadow DOM） |
| `src/content/GrabStudio.tsx` | 悬浮窗「抓图」标签页（缩略图 + 结果 + 复制/收藏/同步生图区） |
| `src/options/TemplateManager.tsx` | 配置中心「抓图模板」管理 |

### 改动文件

| 文件 | 改动 |
|---|---|
| `src/background/index.ts` | 注册 `image-grab:generate` 消息处理 |
| `src/background/prompt-generator.ts` | 新增导出一个通用视觉请求入口（按模板拼 system prompt），复用现有 request 函数 |
| `src/content/index.tsx` | 挂载 ImageGrabber（页面级 shadow root） |
| `src/content/OverlayApp.tsx` | 标签栏注册「抓图」页，并支持接收「打开抓图页」指令切换标签 |
| `src/types/runtime.ts` | 新增消息类型 |
| `src/options/OptionsApp.tsx` | 新增「抓图模板」管理区 |

## 4. 模板系统与输出契约

### 模板结构

```ts
interface GrabTemplate {
  id: string;            // "detailed" | "concise" | ... | 自定义
  name: string;          // 显示名，如「高还原描述」
  description: string;   // 一句话说明
  prompt: string;        // 分析指令（发给视觉模型的 system prompt）
  builtIn: boolean;      // 内置模板不可删除（但可编辑），自定义可增删改
  updatedAt: string;
}
```

### 内置 5 套模板

高还原描述 / 精简还原 / 摄影还原 / 动漫还原 / 电影感还原 —— 指令沿用 Image2Prompt 的成熟文案。

### 输出契约（固定）

无论哪套模板，后台在指令后追加固定要求：只返回 JSON，含：
- `promptEn`：英文关键词提示词，按重要性排序
- `promptZh`：中文提示词，与英文对应
- `negativePrompt`：英文负面提示词
- `notes`：20 字内中文概括

解析器优先提取 ```json 代码块或裸 JSON；失败回退文本启发式提取（与 Image2Prompt 一致）。自定义模板可自由发挥指令，输出仍稳定解析为 4 字段。

### 抓图历史

```ts
interface GrabResult {
  id: string;
  imageUrl: string;        // 原图 URL（用于标识）
  thumbnail: string;       // 压缩小图 dataUrl（悬浮窗缩略图展示）
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
```
历史保留最近 20 条。

### 模板管理规则

- 内置模板：可编辑、不可删除
- 自定义模板：可新增、编辑、删除
- 「恢复默认」一键重置为内置 5 套
- 同一份模板同时供网页内模板菜单与悬浮窗使用

## 5. 抓图交互与网页内面板

### 悬停抓取（ImageGrabber，事件委托）

- 页面级 `mouseover` 事件委托：`closest('img')`，仅对 ≥80×80 且已加载的 `<img>` 生效；动态图片天然覆盖，性能优于逐图监听
- 悬停显示图片边缘小按钮「🎨 抓取生成」，点击弹出模板菜单（模板名称 + 说明）
- 滚动/缩放实时跟随图片定位
- `data:` base64 图片直接取 dataUrl 支持
- 按钮/菜单/面板样式放独立 shadow root，避免被页面 CSS 污染

### 网页内结果面板（右下角）

- 固定右下角，不随滚动
- 状态：分析中（loading）/ 成功 / 失败（错误信息 + 重试）
- 成功页：缩略图 + 模板名 + 4 标签（英文/中文/负面/JSON）各带复制 + 底部「打开抓图页」按钮
- 「打开抓图页」→ 发 `overlay:open` + 切换悬浮窗到「抓图」标签

### 数据流

选模板 → `sendRuntimeMessageLong({ type: 'image-grab:generate' })` → 后台处理返回 → 面板展示 + 结果写入抓图历史 storage → 悬浮窗「抓图」页用 `useChromeStorage` 自动刷新。

## 6. 悬浮窗「抓图」标签页（GrabStudio）

- 标签栏顺序：角色设定 / 抓图 / 图像生成 / 收藏 …
- 内容：
  - 顶部：模板快捷选择器 + 提示「悬停网页图片即可抓取」
  - 「最近生成」列表：缩略图 + 模板名 + 时间；展开后按 EN / 中文 / 负面 / JSON 展示，可复制、收藏、「同步到生图区」、删除
  - 「同步到生图区」→ 把 `promptEn` 写入生图区 workspace（复用 `saveImageWorkspacePrompt`）
  - 空态引导文案
- 用 `useChromeStorage` 订阅抓图历史实时刷新

## 7. 配置中心「模板管理」（TemplateManager）

- OptionsApp 新增「抓图模板」区块
- 模板卡片列表：名称、说明、指令 textarea
- 操作：保存修改 / 新增自定义 / 删除（仅自定义）/ 恢复默认

## 8. 错误处理与边界

- 未配置 API Key / 视觉模型 → 提示去配置中心
- 图片 fetch 超时（30s）或失败 → 明确报错
- 服务商返回非 JSON → 复用现有 `parseErrorMessage` 友好提示
- 压缩后仍超大 → 压缩尺寸与 `max_tokens` 兜底
- 进行中防重复点击（按钮禁用 / loading 态）
- 悬浮窗「抓图」页为空时显示引导文案

## 9. 验证方式

- `npm run build` 无报错
- 手动验证（Chrome 加载 `dist`）：
  - 打开含多图的网页，悬停图片出现按钮 → 选模板 → 网页内面板出结果
  - 悬浮窗「抓图」页可见最新结果，可复制/收藏/同步到生图区
  - 跨域图（如 unsplash）与普通图各测一次
  - 配置中心模板管理：编辑/新增/删除/恢复默认生效
