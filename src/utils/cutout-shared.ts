import { cutoutModelInfo } from "./cutout-models";
import type { CutoutModel } from "./cutout-models";

/** 主線程客戶端與摳像 worker 共享的類型、常量與純函數（不能引入依賴 window/Tauri 的模塊）。 */

export interface CutoutOutcome {
  url: string | null;
  /** 實際產出結果的模型（與請求模型可能不同，見緩存復用） */
  model?: CutoutModel;
  /** Classified failure reason when url is null. */
  error?: string;
}

export interface CutoutProgress {
  /** 0–100。下載有真實進度；推理階段沒有細分，會停在固定值。 */
  percent: number;
  label: string;
}

export function modelWeightId(model: CutoutModel): string {
  if (model === "animeseg") return "animeseg";
  if (model === "modnet") return "Xenova/modnet";
  return "onnx-community/BiRefNet_lite-ONNX";
}

/** 把底層錯誤翻譯成用戶能看懂、且能區分故障域的原因 */
export function classifyCutoutError(model: CutoutModel, error: unknown): string {
  const raw = error instanceof Error ? (error.message || String(error)) : String(error);
  const msg = raw.replace(/\s+/g, " ").trim().slice(0, 120);
  const modelName = cutoutModelInfo(model).name;
  if (/failed to fetch|networkerror|load failed|econn|timeout|fetch|download|status:\s*4|status:\s*5|errno/i.test(msg)) {
    return `${modelName} 模型下载失败（${msg}）· 检查网络与代理后重试`;
  }
  if (/bad_alloc|out of memory|memory|heap/i.test(msg)) {
    return `${modelName} 内存不足（${msg}）· 建议换 MODNet/anime-seg，或確認顯卡支持 WebGPU`;
  }
  if (/wasm|onnxruntime|ort-|inference|tensor|session|ortrun/i.test(msg)) {
    return `${modelName} 推理出错（${msg}）`;
  }
  if (/unsupported|input type/i.test(msg)) {
    return `${modelName} 输入不受支持（${msg}）`;
  }
  return `${modelName} 抠像失败（${msg}）`;
}

// ---- 主線程 ⇄ worker 消息協議 ----

export type CutoutClientMessage =
  | { type: "run"; jobId: number; wallpaperId: string; imageUrl: string; model: CutoutModel; nonce: number }
  | { type: "preload"; jobId: number; model: CutoutModel }
  | { type: "cache-match-res"; reqId: number; blob: Blob | null }
  | { type: "prune"; keep: CutoutModel };

export type CutoutWorkerMessage =
  | { type: "run-done"; jobId: number; blob: Blob | null; model?: CutoutModel; error?: string }
  | { type: "preload-done"; jobId: number; error?: string }
  | { type: "progress"; jobId: number; percent: number; label: string }
  | { type: "model-download"; modelId: string; percent: number }
  | { type: "cache-match"; reqId: number; url: string }
  | { type: "cache-put"; url: string; blob: Blob }
  | { type: "log"; level: "info" | "warn"; message: string };
