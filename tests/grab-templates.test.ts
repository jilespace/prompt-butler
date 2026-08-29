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
