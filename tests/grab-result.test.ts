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
