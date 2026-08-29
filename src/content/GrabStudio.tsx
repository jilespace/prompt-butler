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
