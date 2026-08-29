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
