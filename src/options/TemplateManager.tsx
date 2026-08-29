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
