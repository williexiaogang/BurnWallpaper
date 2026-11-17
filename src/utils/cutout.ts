/**
 * 摳像客戶端（主線程）：推理與合成在 src/workers/cutout.worker.ts 進行，
 * 這裡只做緩存命中判斷、任務派發與模型緩存的讀寫橋接（Tauri IPC 僅主線程可用）。
 * 錯誤分類、類型定義見 cutout-shared.ts。
 */

import { clearInflight, cutoutCacheKey, peekCutout, readInflight, writeInflight } from "./cutout-cache";
import type { CutoutModel } from "./cutout-models";
import { backend, isTauri } from "../backend";
import { migrateBrowserCache, modelRel, readModel, writeModel } from "./model-store";
import { modelWeightId } from "./cutout-shared";
import type { CutoutOutcome, CutoutProgress, CutoutWorkerMessage } from "./cutout-shared";
import { logError, logWarn } from "./logger";

export type { CutoutOutcome, CutoutProgress } from "./cutout-shared";

type JobEntry = {
  resolve: (outcome: CutoutOutcome) => void;
  onProgress?: (progress: CutoutProgress) => void;
};

let worker: Worker | null = null;
let workerBroken = false;
let workerRecycles = 0;
let nextJobId = 1;
const jobs = new Map<number, JobEntry>();
const jobTimers = new Map<number, { idle: ReturnType<typeof setTimeout>; hard: ReturnType<typeof setTimeout> }>();
const preloads = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
const downloadListeners = new Set<(modelId: string, percent: number) => void>();

/** 推理停滯判定：連續這麼久沒有任何進度上報，視為 worker 卡死（BiRefNet/WebGPU 有掛起前例）。 */
const IDLE_TIMEOUT_MS: Record<CutoutModel, number> = { modnet: 90_000, animeseg: 120_000, birefnet: 180_000 };
/** 絕對上限，防止模型反覆吐進度卻永不結束。 */
const HARD_TIMEOUT_MS: Record<CutoutModel, number> = { modnet: 300_000, animeseg: 360_000, birefnet: 600_000 };
/** 自動重建 worker 的最大次數，超過則判定環境不支持摳像。 */
const MAX_WORKER_RECYCLES = 3;
/** 每個在飛任務使用的模型：超時上限按模型區分，日誌也需要它。 */
const jobModels = new Map<number, CutoutModel>();

function clearJobTimers(jobId: number): void {
  const timers = jobTimers.get(jobId);
  if (!timers) return;
  jobTimers.delete(jobId);
  jobModels.delete(jobId);
  clearTimeout(timers.idle);
  clearTimeout(timers.hard);
}

/** 每次進度上報都重置停滯計時器：慢但活著的推理不會被誤殺。 */
function touchJob(jobId: number): void {
  const timers = jobTimers.get(jobId);
  if (!timers) return;
  const model = jobModels.get(jobId) ?? "modnet";
  clearTimeout(timers.idle);
  timers.idle = setTimeout(() => timeoutJob(jobId), IDLE_TIMEOUT_MS[model]);
}

function startJobTimers(jobId: number, model: CutoutModel): void {
  clearJobTimers(jobId);
  jobModels.set(jobId, model);
  jobTimers.set(jobId, {
    idle: setTimeout(() => timeoutJob(jobId), IDLE_TIMEOUT_MS[model]),
    hard: setTimeout(() => timeoutJob(jobId), HARD_TIMEOUT_MS[model]),
  });
}

/** 卡死任務：立刻回報失敗並重建 worker，避免整條隊列被一個掛起的推理永久堵住。 */
function timeoutJob(jobId: number): void {
  const job = jobs.get(jobId);
  if (!job) return;
  const model = jobModels.get(jobId) ?? "modnet";
  jobs.delete(jobId);
  clearJobTimers(jobId);
  logError("cutout", "抠像任务超时", `job=${jobId} · ${model} · ${IDLE_TIMEOUT_MS[model] / 1000}s 无进度，重建 worker`);
  job.resolve({ url: null, error: "抠像超时：模型长时间无响应，已重置抠像组件，请重试" });
  recycleWorker("抠像超时，组件已重置");
}

function failAllJobs(reason: string): void {
  for (const [jobId, job] of jobs) {
    clearJobTimers(jobId);
    job.resolve({ url: null, error: reason });
  }
  jobs.clear();
  for (const preload of preloads.values()) preload.reject(new Error(reason));
  preloads.clear();
}

function recycleWorker(reason: string): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  failAllJobs(reason);
  workerRecycles += 1;
  logWarn("cutout", "抠像组件已重置", `${reason} · 第 ${workerRecycles} 次`);
  if (workerRecycles >= MAX_WORKER_RECYCLES) {
    workerBroken = true;
    logError("cutout", "抠像组件停用", `连续 ${workerRecycles} 次重建仍失败，本次会话不再尝试抠像`);
  }
}

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (!worker) {
    worker = new Worker(new URL("../workers/cutout.worker.ts", import.meta.url), { type: "module", name: "burn-cutout" });
    worker.addEventListener("message", (event: MessageEvent<CutoutWorkerMessage>) => {
      void handleWorkerMessage(event.data);
    });
    worker.addEventListener("error", (event) => {
      // 進程級錯誤：換一個新 worker 重來，連續失敗才徹底停用
      recycleWorker(`抠像组件出错（${event.message || "worker 崩溃"}），已自动重置`);
    });
  }
  return worker;
}

/** 診斷落盤：摳像鏈路的緩存決策與 fetch 追蹤（應用內 LOG 看不到 worker 內部請求）。 */
function debugLog(line: string): void {
  if (!isTauri) return;
  const time = new Date().toISOString().slice(11, 23);
  backend.debugLog(`[${time}] ${line}`).catch(() => undefined);
}

async function resolveCacheMatch(url: string): Promise<Blob | null> {
  const rel = modelRel(url);
  if (!rel) {
    debugLog(`cache-match MISS(no-rel) ${url}`);
    return null;
  }
  try {
    const blob = (await readModel(rel)) ?? (await migrateBrowserCache(url, rel));
    debugLog(`cache-match ${blob ? `HIT(${blob.size}B)` : "MISS"} rel=${rel}`);
    return blob;
  } catch (error) {
    debugLog(`cache-match ERROR rel=${rel} ${String(error)}`);
    return null;
  }
}

async function handleWorkerMessage(message: CutoutWorkerMessage): Promise<void> {
  switch (message.type) {
    case "run-done": {
      const job = jobs.get(message.jobId);
      jobs.delete(message.jobId);
      clearJobTimers(message.jobId);
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
      touchJob(message.jobId);
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
      // worker 內的推理失敗/回退信息帶原始錯誤，寫進 LOG 方便用戶一鍵複製回饋；
      // 追蹤類 info（cache 命中、fetch 狀態）落盤 debug.log，不打擾應用內 LOG
      if (message.level === "warn") logWarn("cutout-worker", message.message);
      else console.info("[cutout-worker]", message.message);
      debugLog(`${message.level === "warn" ? "WARN" : "INFO"} worker ${message.message}`);
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
    startJobTimers(jobId, model);
    instance.postMessage({ type: "run", jobId, wallpaperId, imageUrl, model, nonce });
  }).finally(() => {
    jobs.delete(jobId);
    clearJobTimers(jobId);
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
      let timer: ReturnType<typeof setTimeout>;
      preloads.set(jobId, {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      timer = setTimeout(() => recycleWorker("模型下载或加载超时"), HARD_TIMEOUT_MS[model]);
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
