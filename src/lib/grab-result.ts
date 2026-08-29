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
