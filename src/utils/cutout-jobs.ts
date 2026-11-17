import type { Wallpaper } from "../types";
import { cutoutCacheKey, peekCutout, storeCutout } from "./cutout-cache";
import type { CutoutModel } from "./cutout-models";
import { loadCutout, saveCutout, wallpaperCutoutSource } from "./cutout-store";
import { getCutout } from "./cutout";
import { logError } from "./logger";

export interface CutoutJobProgress {
  wallpaperId: string;
  title: string;
  percent: number;
  label: string;
  model: CutoutModel;
}

interface CutoutJobSnapshot {
  progress: CutoutJobProgress | null;
  errors: Readonly<Record<string, string>>;
  pendingIds: readonly string[];
}

interface ForcedCutout {
  wall: Wallpaper;
  model: CutoutModel;
  force: boolean;
}

const listeners = new Set<() => void>();
let snapshot: CutoutJobSnapshot = { progress: null, errors: {}, pendingIds: [] };
let progress: CutoutJobProgress | null = null;
let errors: Record<string, string> = {};
let desired: Wallpaper[] = [];
let cursor = 0;
let model: CutoutModel = "modnet";
let models: Readonly<Record<string, CutoutModel>> = {};
let forceQueue: ForcedCutout[] = [];
let pumping = false;
let forceNonce = 1;

function modelFor(wall: Wallpaper): CutoutModel {
  return models[wall.id] ?? model;
}

function errorKey(id: string, usedModel: CutoutModel): string {
  return `${id}\n${usedModel}`;
}

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
  for (const item of forceQueue) pendingIds.push(item.wall.id);
  for (let index = cursor; index < desired.length; index += 1) {
    const wall = desired[index];
    if (!peekCutout(wall.id, wall.image, modelFor(wall)) && !errors[errorKey(wall.id, modelFor(wall))]) pendingIds.push(wall.id);
  }
  snapshot = { progress, errors, pendingIds };
  for (const listener of listeners) listener();
}

function remember(wall: Wallpaper, url: string, used: CutoutModel) {
  storeCutout(cutoutCacheKey(wall.id, wall.image, used), { url, model: used });
}

export function syncCutoutQueue(walls: Wallpaper[], nextModel: CutoutModel, nextModels: Readonly<Record<string, CutoutModel>> = {}) {
  desired = walls;
  model = nextModel;
  models = nextModels;
  cursor = 0;
  publish();
  void pump();
}

function enqueueCutout(wall: Wallpaper, nextModel: CutoutModel, force: boolean) {
  errors = { ...errors };
  delete errors[errorKey(wall.id, nextModel)];
  if (force || !peekCutout(wall.id, wall.image, nextModel)) {
    forceQueue = [{ wall, model: nextModel, force }, ...forceQueue.filter((item) => item.wall.id !== wall.id)];
  }
  publish();
  void pump();
}

export function forceCutout(wall: Wallpaper, nextModel: CutoutModel) {
  enqueueCutout(wall, nextModel, true);
}

export function prioritizeCutout(wall: Wallpaper, nextModel: CutoutModel) {
  enqueueCutout(wall, nextModel, false);
}

async function runOne(wall: Wallpaper, usedModel: CutoutModel, force: boolean, foreground: boolean) {
  const source = wallpaperCutoutSource(wall.localPath, wall.image);
  if (!force) {
    try {
      const saved = await loadCutout(wall.id, source, usedModel);
      if (saved) {
        remember(wall, saved.url, usedModel);
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
  if (foreground) await new Promise((resolve) => setTimeout(resolve, 350));
  let percent = 0;
  const report = (nextPercent: number, label: string) => {
    percent = Math.max(percent, nextPercent);
    progress = { wallpaperId: wall.id, title: wall.title, percent, label, model: usedModel };
    publish();
  };
  report(4, "准备抠像");
  const outcome = await getCutout(wall.id, wall.image, usedModel, force ? forceNonce++ : 0, (update) => report(update.percent, update.label));
  if (!outcome.url || !outcome.model) {
    const reason = outcome.error ?? "未知原因";
    errors = { ...errors, [errorKey(wall.id, usedModel)]: reason };
    logError("cutout", "人物抠像失败", `${wall.title} · ${usedModel} · ${reason}`);
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

function nextIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 3000 });
    } else {
      setTimeout(resolve, 300);
    }
  });
}

const RUN_GUARD_MS: Record<CutoutModel, number> = { modnet: 360_000, animeseg: 420_000, birefnet: 660_000 };

function withGuard<T>(task: Promise<T>, usedModel: CutoutModel): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("抠像任务超时（队列已跳过，可点击重试）")), RUN_GUARD_MS[usedModel]);
    task.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const forced = forceQueue.shift();
      const wall = forced?.wall ?? desired[cursor];
      if (!wall) break;
      const foreground = Boolean(forced) || cursor === 0;
      if (!forced) cursor += 1;
      const usedModel = forced?.model ?? modelFor(wall);
      if (!forced && (peekCutout(wall.id, wall.image, usedModel) || errors[errorKey(wall.id, usedModel)])) continue;
      if (!foreground) await nextIdle();
      try {
        await withGuard(runOne(wall, usedModel, forced?.force ?? false, foreground), usedModel);
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
    if (forceQueue.length > 0 || desired.slice(cursor).some((wall) => !peekCutout(wall.id, wall.image, modelFor(wall)) && !errors[errorKey(wall.id, modelFor(wall))])) {
      void pump();
    }
  }
}
