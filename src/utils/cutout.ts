/**
 * 摳像客戶端（主線程）：推理與合成在 src/workers/cutout.worker.ts 進行，
 * 這裡只做緩存命中判斷、任務派發與模型緩存的讀寫橋接（Tauri IPC 僅主線程可用）。
 * 錯誤分類、類型定義見 cutout-shared.ts。
 */

import { clearInflight, cutoutCacheKey, peekCutout, readInflight, writeInflight } from "./cutout-cache";
import type { CutoutModel } from "./cutout-models";
import { migrateBrowserCache, modelRel, readModel, writeModel } from "./model-store";
import { modelWeightId } from "./cutout-shared";
import type { CutoutOutcome, CutoutProgress, CutoutWorkerMessage } from "./cutout-shared";

export type { CutoutOutcome, CutoutProgress } from "./cutout-shared";

type JobEntry = {
  resolve: (outcome: CutoutOutcome) => void;
  onProgress?: (progress: CutoutProgress) => void;
};

let worker: Worker | null = null;
let workerBroken = false;
let nextJobId = 1;
const jobs = new Map<number, JobEntry>();
const preloads = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
const downloadListeners = new Set<(modelId: string, percent: number) => void>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (!worker) {
    worker = new Worker(new URL("../workers/cutout.worker.ts", import.meta.url), { type: "module", name: "burn-cutout" });
    worker.addEventListener("message", (event: MessageEvent<CutoutWorkerMessage>) => {
      void handleWorkerMessage(event.data);
    });
    worker.addEventListener("error", (event) => {
      workerBroken = true;
      const error = `抠像组件无法启动（${event.message || "worker 加载失败"}）`;
      for (const job of jobs.values()) job.resolve({ url: null, error });
      jobs.clear();
      for (const preload of preloads.values()) preload.reject(new Error(error));
      preloads.clear();
    });
  }
  return worker;
}

async function resolveCacheMatch(url: string): Promise<Blob | null> {
  const rel = modelRel(url);
  if (!rel) return null;
  try {
    return (await readModel(rel)) ?? (await migrateBrowserCache(url, rel));
  } catch {
    return null;
  }
}

async function handleWorkerMessage(message: CutoutWorkerMessage): Promise<void> {
  switch (message.type) {
    case "run-done": {
      const job = jobs.get(message.jobId);
      jobs.delete(message.jobId);
      if (!job) return;
      const url = message.blob ? URL.createObjectURL(message.blob) : null;
      job.resolve({ url, model: url ? message.model : undefined, error: url ? undefined : message.error });
      return;
    }
    case "preload-done": {
      const preload = preloads.get(message.jobId);
      preloads.delete(message.jobId);
      if (!preload) return;
      if (message.error) preload.reject(new Error(message.error));
      else preload.resolve();
      return;
    }
    case "progress": {
      jobs.get(message.jobId)?.onProgress?.({ percent: message.percent, label: message.label });
      return;
    }
    case "model-download": {
      for (const listener of downloadListeners) listener(message.modelId, message.percent);
      return;
    }
    case "cache-match": {
      const blob = await resolveCacheMatch(message.url);
      worker?.postMessage({ type: "cache-match-res", reqId: message.reqId, blob });
      return;
    }
    case "cache-put": {
      const rel = modelRel(message.url);
      if (rel) {
        writeModel(rel, message.blob).catch((error) => {
          console.warn("[cutout] 保存模型缓存失败", rel, error);
        });
      }
      return;
    }
    case "log": {
      (message.level === "warn" ? console.warn : console.info)("[cutout-worker]", message.message);
      return;
    }
  }
}

/**
 * Returns the foreground cutout PNG object URL, or a classified error.
 * 成功結果按「圖片 + nonce」記——一張壁紙只有一份結果，任何模型產出都復用；
 * model 只決定未命中時用哪個模型推理。nonce 變化才強制重摳（用戶點「重算」）。
 */
export function getCutout(
  wallpaperId: string,
  imageUrl: string,
  model: CutoutModel,
  nonce = 0,
  onProgress?: (progress: CutoutProgress) => void,
): Promise<CutoutOutcome> {
  const done = peekCutout(wallpaperId, imageUrl, nonce);
  if (done) return Promise.resolve({ url: done.url, model: done.model });

  const key = cutoutCacheKey(wallpaperId, imageUrl, nonce);
  const cached = readInflight<CutoutOutcome>(key);
  if (cached) return cached;

  const instance = getWorker();
  if (!instance) return Promise.resolve({ url: null, error: "抠像组件不可用" });

  const jobId = nextJobId++;
  const task = new Promise<CutoutOutcome>((resolve) => {
    jobs.set(jobId, { resolve, onProgress });
    instance.postMessage({ type: "run", jobId, wallpaperId, imageUrl, model, nonce });
  }).finally(() => {
    jobs.delete(jobId);
    clearInflight(key);
  });
  writeInflight(key, task);
  return task;
}

/** 預先下載模型權重（不切換、不摳圖）。onProgress 是檔案下載的 0–100。 */
export async function ensureModelDownloaded(model: CutoutModel, onProgress?: (percent: number) => void): Promise<void> {
  const weightId = modelWeightId(model);
  let last = -1;
  const listener = (id: string, percent: number) => {
    if (id !== weightId || percent === last) return;
    last = percent;
    onProgress?.(percent);
  };
  if (onProgress) downloadListeners.add(listener);
  try {
    const instance = getWorker();
    if (!instance) throw new Error("抠像组件不可用");
    const jobId = nextJobId++;
    await new Promise<void>((resolve, reject) => {
      preloads.set(jobId, { resolve, reject });
      instance.postMessage({ type: "preload", jobId, model });
    }).finally(() => {
      preloads.delete(jobId);
    });
    if (last >= 0 && last < 100) onProgress?.(100);
  } finally {
    if (onProgress) downloadListeners.delete(listener);
  }
}

/** 切換摳像模型後釋放其他模型的推理會話（worker 內執行；在飛任務完成後生效）。 */
export function pruneCutoutSessions(keep: CutoutModel): void {
  worker?.postMessage({ type: "prune", keep });
}
