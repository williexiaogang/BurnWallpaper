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

function errorKey(id: string): string {
  return id;
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
    // 已成功（任何模型）或已失敗（終態，等用戶手動重算）的都不算待處理
    if (!peekCutout(wall.id, wall.image) && !errors[wall.id]) pendingIds.push(wall.id);
  }
  snapshot = { progress, errors, pendingIds };
  for (const listener of listeners) listener();
}

function remember(wall: Wallpaper, url: string, used: CutoutModel) {
  storeCutout(cutoutCacheKey(wall.id, wall.image, 0), { url, model: used });
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
  delete errors[errorKey(wall.id)];
  forceQueue = [wall, ...forceQueue.filter((item) => item.id !== wall.id)];
  publish();
  void pump();
}

async function runOne(wall: Wallpaper, usedModel: CutoutModel, force: boolean, foreground: boolean) {
  const source = wallpaperCutoutSource(wall.localPath, wall.image);
  if (!force) {
    try {
      // 已保存的摳像不區分模型：哪個模型產出的都直接復用
      const saved = await loadCutout(wall.id, source);
      if (saved) {
        remember(wall, saved.url, saved.model);
        if (errors[errorKey(wall.id)]) {
          errors = { ...errors };
          delete errors[errorKey(wall.id)];
        }
        return;
      }
    } catch (error) {
      logError("cutout", "读取本地抠像失败", `${wall.id} · ${String(error)}`);
    }
  }
  // 前台推理讓位切換動畫（450ms slash）：延遲 350ms 再吃滿 CPU，動畫先落地
  if (foreground) await new Promise((resolve) => setTimeout(resolve, 350));
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
    const reason = outcome.error ?? "未知原因";
    errors = { ...errors, [errorKey(wall.id)]: reason };
    // 分類失敗也要進 LOG，否則失敗提示讓用戶「複製 LOG 回饋」時日誌裡找不到任何線索
    logError("cutout", "人物抠像失败", `${wall.title} · ${usedModel} · ${reason}`);
    return;
  }
  if (errors[errorKey(wall.id)]) {
    errors = { ...errors };
    delete errors[errorKey(wall.id)];
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

/** 空閒調度：背景摳像讓出主線程優先級，避免和切換動畫、圖片解碼搶時間片。 */
function nextIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 3000 });
    } else {
      setTimeout(resolve, 300);
    }
  });
}

/** 單個任務的兜底上限：worker 內部已有停滯看門狗，這裡防的是 IPC／寫盤卡住導致隊列永久堵死。 */
const RUN_GUARD_MS = 200_000;

function withGuard<T>(task: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("抠像任务超时（队列已跳过，可点击重试）")), RUN_GUARD_MS);
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
      const wall = forced ?? desired[cursor];
      if (!wall) break;
      // 佇列第一位是當前活躍壁紙，立即處理；其餘是背景補算，等瀏覽器空閒
      const foreground = !forced && cursor === 0;
      if (!forced) cursor += 1;
      // 已成功（任何模型）的跳過；已失敗的也是終態——切換壁紙不會反覆重摳，
      // 只有用戶點「重算」（forceCutout）才會用當前模型再試一次
      if (!forced && (peekCutout(wall.id, wall.image) || errors[wall.id])) continue;
      if (!foreground) await nextIdle();
      const usedModel = model;
      try {
        await withGuard(runOne(wall, usedModel, Boolean(forced), foreground));
      } catch (error) {
        errors = { ...errors, [errorKey(wall.id)]: String(error) };
        logError("cutout", "人物抠像失败", `${wall.id} · ${String(error)}`);
      } finally {
        if (progress?.wallpaperId === wall.id) progress = null;
        publish();
      }
    }
  } finally {
    pumping = false;
    if (forceQueue.length > 0 || desired.slice(cursor).some((wall) => !peekCutout(wall.id, wall.image) && !errors[wall.id])) {
      void pump();
    }
  }
}
