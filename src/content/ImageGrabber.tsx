import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle, Settings, X } from "lucide-react";

import { useExtensionSettings } from "../hooks/useExtensionSettings";
import { getGrabTemplates, setLastGrabTemplateId } from "../lib/grab-library";
import { clearGrabTask, getGrabTask } from "../lib/task-broker";
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
