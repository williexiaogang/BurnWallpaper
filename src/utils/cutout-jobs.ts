import type { Wallpaper } from "../types";
import { cutoutCacheKey, peekCutout, storeCutout } from "./cutout-cache";
import type { CutoutModel } from "./cutout-models";
import { loadCutout, saveCutout, wallpaperCutoutSource } from "./cutout-store";
import { logError } from "./logger";

export interface CutoutJobProgress {
  wallpaperId: string;
  title: string;
  percent: number;
  label: string;
  model: CutoutModel;
}

function errorKey(id: string, used: CutoutModel): string {
  return `${id}\n${used}`;
}

interface CutoutJobSnapshot {
  progress: CutoutJobProgress | null;
  errors: Readonly<Record<string, string>>;
  pendingIds: readonly string[];
}

const listeners = new Set<() => void>();
let snapshot: CutoutJobSnapshot = { progress: null, errors: {}, pendingIds: [] };
let progress: CutoutJobProgress | null = null;
let errors: Record<string, string> = {};
let desired: Wallpaper[] = [];
let cursor = 0;
let model: CutoutModel = "modnet";
let forceQueue: Wallpaper[] = [];
let pumping = false;
let forceNonce = 1;

export function subscribeCutoutJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCutoutJobSnapshot(): CutoutJobSnapshot {
  return snapshot;
}

function publish() {
  const pendingIds: string[] = [];
  if (progress) pendingIds.push(progress.wallpaperId);
  for (const wall of forceQueue) pendingIds.push(wall.id);
  for (let index = cursor; index < desired.length; index += 1) {
    const wall = desired[index];
    if (!peekCutout(wall.id, wall.image, model, 0)) pendingIds.push(wall.id);
  }
  snapshot = { progress, errors, pendingIds };
  for (const listener of listeners) listener();
}

function remember(wall: Wallpaper, url: string, used: CutoutModel) {
  storeCutout(cutoutCacheKey(wall.id, wall.image, used, 0), { url, model: used });
}

/** One image at a time. The active wallpaper is first; a finished result is never recomputed here. */
export function syncCutoutQueue(walls: Wallpaper[], nextModel: CutoutModel) {
  desired = walls;
  model = nextModel;
  cursor = 0;
  publish();
  void pump();
}

export function forceCutout(wall: Wallpaper, nextModel: CutoutModel) {
  model = nextModel;
  errors = { ...errors };
  delete errors[errorKey(wall.id, nextModel)];
  forceQueue = [wall, ...forceQueue.filter((item) => item.id !== wall.id)];
  publish();
  void pump();
}

async function runOne(wall: Wallpaper, usedModel: CutoutModel, force: boolean) {
  const source = wallpaperCutoutSource(wall.localPath, wall.image);
  if (!force) {
    try {
      const saved = await loadCutout(wall.id, source, usedModel);
      if (saved) {
        remember(wall, saved.url, saved.model);
        if (errors[errorKey(wall.id, usedModel)]) {
          errors = { ...errors };
          delete errors[errorKey(wall.id, usedModel)];
        }
        return;
      }
    } catch (error) {
      logError("cutout", "读取本地抠像失败", `${wall.id} · ${String(error)}`);
    }
  }
  let percent = 0;
  const report = (nextPercent: number, label: string) => {
    percent = Math.max(percent, nextPercent);
    progress = { wallpaperId: wall.id, title: wall.title, percent, label, model: usedModel };
    publish();
  };
  report(4, "准备抠像");
  const { getCutout } = await import("./cutout");
  const outcome = await getCutout(wall.id, wall.image, usedModel, force ? forceNonce++ : 0, (update) => report(update.percent, update.label));
  if (!outcome.url || !outcome.model) {
    errors = { ...errors, [errorKey(wall.id, usedModel)]: outcome.error ?? "未知原因" };
    return;
  }
  if (errors[errorKey(wall.id, usedModel)]) {
    errors = { ...errors };
    delete errors[errorKey(wall.id, usedModel)];
  }
  remember(wall, outcome.url, outcome.model);
  publish();
  report(96, "保存到本地");
  try {
    const stored = await saveCutout(wall.id, source, outcome.url, outcome.model);
    remember(wall, stored, outcome.model);
  } catch (error) {
    logError("cutout", "保存本地抠像失败", `${wall.id} · ${String(error)}`);
  }
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const forced = forceQueue.shift();
      const wall = forced ?? desired[cursor];
      if (!wall) break;
      if (!forced) cursor += 1;
      if (!forced && peekCutout(wall.id, wall.image, model, 0)) continue;
      const usedModel = model;
      try {
        await runOne(wall, usedModel, Boolean(forced));
      } catch (error) {
        errors = { ...errors, [errorKey(wall.id, usedModel)]: String(error) };
        logError("cutout", "人物抠像失败", `${wall.id} · ${String(error)}`);
      } finally {
        if (progress?.wallpaperId === wall.id) progress = null;
        publish();
      }
    }
  } finally {
    pumping = false;
    if (forceQueue.length > 0 || desired.slice(cursor).some((wall) => !peekCutout(wall.id, wall.image, model, 0))) {
      void pump();
    }
  }
}
