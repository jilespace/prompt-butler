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
