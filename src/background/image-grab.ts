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
