import { env, pipeline } from "@huggingface/transformers";
import * as ort from "onnxruntime-web";
import { clearInflight, cutoutCacheKey, peekCutout, readInflight, storeCutout, writeInflight } from "./cutout-cache";
import { cutoutModelInfo } from "./cutout-models";
import type { CutoutModel } from "./cutout-models";

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

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = any;

const transformersPipelines = new Map<string, Promise<Segmenter>>();
const pipelineListeners = new Set<(progress: CutoutProgress) => void>();

function emitPipelineProgress(info: { status?: string; progress?: number }) {
  const ratio = typeof info.progress === "number" ? Math.max(0, Math.min(100, info.progress)) : 0;
  const downloading = info.status === "progress" || info.status === "download" || info.status === "initiate";
  const progress = { percent: 8 + Math.round(ratio * 0.6), label: downloading ? "下载模型" : "加载模型" };
  for (const listener of pipelineListeners) listener(progress);
}

function getPipeline(modelId: string): Promise<Segmenter> {
  let promise = transformersPipelines.get(modelId);
  if (!promise) {
    // BiRefNet 先走 WebGPU（wasm 跑 fp32 會 bad_alloc）；不可用時回退 wasm
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const primary: any = modelId.includes("BiRefNet") ? { device: "webgpu" } : {};
    primary.progress_callback = emitPipelineProgress;
    promise = pipeline("image-segmentation", modelId, primary).catch((error) => {
      transformersPipelines.delete(modelId);
      if (!modelId.includes("BiRefNet")) throw error;
      const fallback = pipeline("image-segmentation", modelId, { progress_callback: emitPipelineProgress }).catch((fallbackError) => {
        transformersPipelines.delete(modelId);
        throw fallbackError;
      });
      transformersPipelines.set(modelId, fallback);
      return fallback;
    });
    transformersPipelines.set(modelId, promise);
  }
  return promise;
}

interface MaskLike {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

async function fetchBitmap(imageUrl: string): Promise<ImageBitmap> {
  const response = await fetch(imageUrl);
  return createImageBitmap(await response.blob());
}

/** Composite the original bitmap with an 8-bit mask (resized to fit) as alpha; returns PNG blob URL. */
async function compositeWithMask(bitmap: ImageBitmap, mask: MaskLike): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = mask.width;
  maskCanvas.height = mask.height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) return null;
  const maskData = maskContext.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i += 1) {
    maskData.data[i * 4] = 255;
    maskData.data[i * 4 + 1] = 255;
    maskData.data[i * 4 + 2] = 255;
    maskData.data[i * 4 + 3] = mask.data[i];
  }
  maskContext.putImageData(maskData, 0, 0);

  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = canvas.width;
  alphaCanvas.height = canvas.height;
  const alphaContext = alphaCanvas.getContext("2d");
  if (!alphaContext) return null;
  alphaContext.drawImage(maskCanvas, 0, 0, alphaCanvas.width, alphaCanvas.height);
  const alpha = alphaContext.getImageData(0, 0, alphaCanvas.width, alphaCanvas.height).data;

  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i + 3] = alpha[i + 3];
  }
  context.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? URL.createObjectURL(blob) : null;
}

function bitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d unavailable");
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

// ---- transformers.js 模型（BiRefNet / MODNet） ----

async function runTransformersModel(modelId: string, bitmap: ImageBitmap, onProgress?: (progress: CutoutProgress) => void): Promise<string | null> {
  onProgress?.({ percent: 8, label: "加载模型" });
  const segmenter = await getPipeline(modelId);
  onProgress?.({ percent: 74, label: "推理中" });
  // 此版 transformers.js 的 RawImage.read 只接受 string/URL/Blob/Canvas，不支持 ImageBitmap/ImageData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await segmenter(bitmapToCanvas(bitmap)) as any[];
  const mask: MaskLike | undefined = results[0]?.mask;
  if (!mask) throw new Error("模型没有返回遮罩");
  return compositeWithMask(bitmap, mask);
}

// ---- anime-seg（ISNet，手動接 ONNX） ----

const ANIMESEG_URL = "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx";
const ANIMESEG_SIZE = 1024;

let animeSegSession: Promise<ort.InferenceSession> | null = null;

function getAnimeSegSession(): Promise<ort.InferenceSession> {
  if (!animeSegSession) {
    animeSegSession = (async () => {
      console.info("[cutout] anime-seg downloading…");
      const response = await fetch(ANIMESEG_URL);
      if (!response.ok || !response.body) throw new Error(`anime-seg 下载失败 ${response.status}`);
      const total = Number(response.headers.get("content-length")) || 0;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        const ratio = total > 0 ? loaded / total : 0;
        const progress = { percent: 8 + Math.round(Math.min(1, ratio) * 60), label: "下载模型" };
        for (const listener of pipelineListeners) listener(progress);
      }
      const buffer = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }
      console.info("[cutout] anime-seg weights downloaded, creating session…");
      const session = await ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
      console.info("[cutout] anime-seg session ready");
      return session;
    })().catch((error) => {
      animeSegSession = null;
      throw error;
    });
  }
  return animeSegSession;
}

async function runAnimeSeg(bitmap: ImageBitmap, onProgress?: (progress: CutoutProgress) => void): Promise<string | null> {
  onProgress?.({ percent: 8, label: "加载模型" });
  const session = await getAnimeSegSession();
  onProgress?.({ percent: 74, label: "推理中" });

  // 與官方 inference.py 一致：等比縮放裝進 1024 方形、居中、其餘補零，僅做 /255
  const s = ANIMESEG_SIZE;
  const scale = Math.min(s / bitmap.width, s / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const pw = s - w;
  const ph = s - h;

  const prepCanvas = document.createElement("canvas");
  prepCanvas.width = s;
  prepCanvas.height = s;
  const prepContext = prepCanvas.getContext("2d");
  if (!prepContext) return null;
  prepContext.fillStyle = "#000";
  prepContext.fillRect(0, 0, s, s);
  prepContext.drawImage(bitmap, pw / 2, ph / 2, w, h);
  const pixels = prepContext.getImageData(0, 0, s, s).data;

  const input = new Float32Array(3 * s * s);
  for (let i = 0; i < s * s; i += 1) {
    input[i] = pixels[i * 4] / 255;
    input[s * s + i] = pixels[i * 4 + 1] / 255;
    input[2 * s * s + i] = pixels[i * 4 + 2] / 255;
  }

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  const output = await session.run({ [inputName]: new ort.Tensor("float32", input, [1, 3, s, s]) });
  console.info("[cutout] anime-seg inference done");
  const pred = output[outputName].data as Float32Array;

  // 裁掉補零區，縮放回原始尺寸作為 8-bit mask
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = w;
  cropCanvas.height = h;
  const cropContext = cropCanvas.getContext("2d");
  if (!cropContext) return null;
  const cropData = cropContext.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (ph / 2 + y) * s + (pw / 2 + x);
      const value = Math.round(Math.max(0, Math.min(1, pred[src])) * 255);
      const dst = (y * w + x) * 4;
      cropData.data[dst] = 255;
      cropData.data[dst + 1] = 255;
      cropData.data[dst + 2] = 255;
      cropData.data[dst + 3] = value;
    }
  }
  cropContext.putImageData(cropData, 0, 0);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = bitmap.width;
  maskCanvas.height = bitmap.height;
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) return null;
  maskContext.imageSmoothingEnabled = true;
  maskContext.drawImage(cropCanvas, 0, 0, bitmap.width, bitmap.height);
  const mask = maskContext.getImageData(0, 0, bitmap.width, bitmap.height);
  if (!mask.data.some((value, index) => index % 4 === 3 && value > 16)) {
    throw new Error("模型没有返回遮罩");
  }
  const gray = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = mask.data[i * 4 + 3];
  }

  return compositeWithMask(bitmap, { data: gray, width: mask.width, height: mask.height });
}

/** 預先下載模型權重（不切換、不摳圖），供「下载并切换」確認後調用 */
export async function ensureModelDownloaded(model: CutoutModel): Promise<void> {
  if (model === "animeseg") {
    await getAnimeSegSession();
    return;
  }
  await getPipeline(model === "modnet" ? "Xenova/modnet" : "onnx-community/BiRefNet_lite-ONNX");
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

// ---- 統一入口 ----

/**
 * Returns the foreground cutout PNG object URL, or a classified error.
 * 成功結果按「圖片 + nonce」記，不按模型：換模型直接復用。
 * 失敗不記，之後用別的模型或手動重算會再跑。nonce 變化才強制重摳。
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

  const task = (async (): Promise<CutoutOutcome> => {
    if (onProgress) pipelineListeners.add(onProgress);
    try {
      onProgress?.({ percent: 5, label: "读取图片" });
      const bitmap = await fetchBitmap(imageUrl);
      let url: string | null = null;
      switch (model) {
        case "modnet":
          url = await runTransformersModel("Xenova/modnet", bitmap, onProgress);
          break;
        case "animeseg":
          url = await runAnimeSeg(bitmap, onProgress);
          break;
        default:
          url = await runTransformersModel("onnx-community/BiRefNet_lite-ONNX", bitmap, onProgress);
          break;
      }
      onProgress?.({ percent: 92, label: "合成遮罩" });
      if (!url) return { url: null, error: `${cutoutModelInfo(model).name} 没有返回遮罩` };
      storeCutout(key, { url, model });
      return { url, model };
    } catch (error) {
      console.warn("[cutout] failed:", model, error);
      return { url: null, error: classifyCutoutError(model, error) };
    } finally {
      if (onProgress) pipelineListeners.delete(onProgress);
      clearInflight(key);
    }
  })();

  writeInflight(key, task);
  return task;
}
