/**
 * 摳像 worker：transformers.js / ONNX 推理與遮罩合成全部在此執行。
 * 單線程 WASM 推理若跑在主線程會阻塞 UI（壁紙切換卡頓的根因），因此整體遷入 worker。
 * 模型文件的本地緩存讀寫依賴 Tauri IPC（僅主線程可用），通過 cache-match / cache-put 消息橋接。
 */

import { env, pipeline, ModelFileNotFoundError } from "@huggingface/transformers";
// ORT 1.31 的 WebGPU 走 asyncify 構建：webgpuInit 定義在 asyncify mjs 膠水裡，
// 完整的 WebGpu EP（ExecutionProvider/Context/Kernels）只編譯進 asyncify wasm。
// jsep 變體沒有 webgpuInit，指過去會報 "ht(...).webgpuInit is not a function"。
// /webgpu 子路徑（asyncify 路線，122KB）比根導入的默認 bundle（jsep 路線，417KB）更小且帶 WebGPU。
import * as ort from "onnxruntime-web/webgpu";
// 包导出里没有这些 wasm/mjs 文件，只能按文件路径引进来。
import ortAsyncifyMjsUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url";
import ortAsyncifyWasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url";
// transformers 自帶的 ORT 是另一個獨立實例（嵌套依賴 1.31.0-dev），
// 它內聯的膠水引用 asyncify 變體——wasm 必須用它自己版本的文件，跨版本混用有 ABI 風險。
import hfAsyncifyMjsUrl from "../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url";
import hfAsyncifyWasmUrl from "../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url";
import { modelRel } from "../utils/model-path";
import { BIREFNET_MODEL_ID, classifyCutoutError, modelWeightId } from "../utils/cutout-shared";
import type { CutoutClientMessage, CutoutProgress, CutoutWorkerMessage } from "../utils/cutout-shared";
import { cutoutModelInfo } from "../utils/cutout-models";
import type { CutoutModel } from "../utils/cutout-models";

// 顯式指定 {mjs, wasm}：transformers 默認解析在 Vite 打包後會 404（release 版目前靠
// jsdelivr CDN 兜底），顯式配置後 dev/release 行為一致且不依賴網絡。
ort.env.wasm.wasmPaths = { mjs: ortAsyncifyMjsUrl, wasm: ortAsyncifyWasmUrl };
ort.env.wasm.numThreads = 1;
env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = { mjs: hfAsyncifyMjsUrl, wasm: hfAsyncifyWasmUrl };
  env.backends.onnx.wasm.numThreads = 1;
}

// ---- WebGPU 能力探測 ----

let webgpuAvailable: boolean | null = null;

/** worker 內探測 WebGPU（WebView2/Chromium 113+ 支持；遠程桌面、舊 GPU 等場景不可用則回退 CPU）。 */
async function hasWebGPU(): Promise<boolean> {
  if (webgpuAvailable !== null) return webgpuAvailable;
  try {
    const gpu = (self as unknown as { navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } } }).navigator?.gpu;
    if (!gpu) {
      webgpuAvailable = false;
    } else {
      webgpuAvailable = (await gpu.requestAdapter()) !== null;
    }
  } catch {
    webgpuAvailable = false;
  }
  log("info", webgpuAvailable ? "webgpu 可用：推理走 GPU" : "webgpu 不可用：推理走 CPU");
  return webgpuAvailable;
}

// DOM lib 下 self 是 Window；worker 里手动收窄，避免引入 WebWorker lib 造成的全局类型冲突。
const ctx = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void;
  postMessage: (message: CutoutWorkerMessage) => void;
};

function post(message: CutoutWorkerMessage): void {
  ctx.postMessage(message);
}

function log(level: "info" | "warn", message: string): void {
  post({ type: "log", level, message });
}

// ---- 與主線程的模型緩存橋接 ----

const cacheReplies = new Map<number, (blob: Blob | null) => void>();
let cacheReqSeq = 0;

/** 經主線程讀本地模型緩存（Tauri: data_dir/models；瀏覽器開發: IndexedDB）。 */
async function readCachedModel(url: string): Promise<Blob | null> {
  if (!modelRel(url)) return null;
  const reqId = ++cacheReqSeq;
  post({ type: "cache-match", reqId, url });
  return new Promise((resolve) => cacheReplies.set(reqId, resolve));
}

function writeCachedModel(url: string, blob: Blob): void {
  post({ type: "cache-put", url, blob });
}

// transformers.js 的模型文件改存到应用目录；缓存读写走上面的消息桥。
env.useCustomCache = true;
env.customCache = {
  async match(request: string): Promise<Response | undefined> {
    const local = await readCachedModel(request);
    if (!local || local.size < 16) {
      log("info", `cache MISS ${request}`);
      return undefined;
    }
    log("info", `cache HIT ${local.size}B ${request}`);
    return new Response(local, { headers: { "content-length": String(local.size) } });
  },
  async put(request: string, response: Response): Promise<void> {
    try {
      log("info", `cache PUT ${request}`);
      writeCachedModel(request, await response.blob());
    } catch (error) {
      log("warn", `模型緩存寫入失敗 ${String(error)}`);
    }
  },
};

// 追蹤 + 補救 transformers/ORT 發出的每一次 fetch：
// 1. "/models/..." 是 transformers 的本地模型路徑探測（allowLocalModels=true 時）——
//    我們的模型在應用數據目錄（走緩存橋），Web 服務器上沒有這個路徑；
//    dev 下 Vite 的 SPA fallback 還會返回 index.html（200+HTML），必須攔成 404。
// 2. 網絡失敗（如 TypeError: Failed to fetch，離線/被牆時要掛 20+ 秒）合成 404：
//    transformers 對 404 有優雅降級——可選文件（tokenizer 等探測）返回 null 繼續跑，
//    必需文件拋 ModelFileNotFoundError，不會把整個 pipeline 創建炸掉。
const tracedFetch = env.fetch;
if (tracedFetch) {
  env.fetch = async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
    if (url.startsWith("/models/")) {
      log("info", `fetch local-probe→404 ${url}`);
      return new Response(null, { status: 404, statusText: "not served" });
    }
    try {
      const response = await tracedFetch(input, init);
      log("info", `fetch ${response.status} ${url}`);
      return response;
    } catch (error) {
      log("warn", `fetch FAILED→404 ${url} — ${String(error)}`);
      return new Response(null, { status: 404, statusText: "offline" });
    }
  };
}

// ---- 進度廣播 ----

interface RunHandle {
  progress: (progress: CutoutProgress) => void;
}

const runs = new Map<number, RunHandle>();
/** 正在等待模型下載/加載的任務，會收到下載進度。 */
const loadingJobIds = new Set<number>();

function emitLoadingProgress(percent: number, label: string): void {
  for (const jobId of loadingJobIds) {
    runs.get(jobId)?.progress({ percent, label });
  }
}

function emitModelDownload(modelId: string, percent: number): void {
  post({ type: "model-download", modelId, percent });
}

// ---- transformers.js 模型（BiRefNet / MODNet）----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = any;

const transformersPipelines = new Map<string, Promise<Segmenter>>();
const pipelineDevices = new Map<string, "webgpu" | "wasm">();

function modelDtype(repoId: string): "fp16" | "fp32" {
  return repoId === BIREFNET_MODEL_ID ? "fp16" : "fp32";
}

async function essentialsCached(repoId: string): Promise<boolean> {
  const weights = modelDtype(repoId) === "fp16" ? "onnx/model_fp16.onnx" : "onnx/model.onnx";
  for (const file of ["config.json", "preprocessor_config.json", weights]) {
    const blob = await readCachedModel(`https://huggingface.co/${repoId}/resolve/main/${file}`);
    if (!blob) return false;
  }
  return true;
}

/**
 * 創建 pipeline。offline=true 時完全禁止網絡：必需文件齊全的情況下，
 * transformers 對 tokenizer_config.json 等可選文件的探測會走「本地路徑」→ 被攔成 404 →
 * 立即返回「沒有」，而不是掛在网络上 20+ 秒後把整個 pipeline 創建炸掉。
 * 注意 allowLocalModels 與 allowRemoteModels 不能同時為 false（transformers 頂層校驗會拒絕）。
 */
async function createPipeline(
  repoId: string,
  device: "webgpu" | "wasm",
  progress_callback: (info: { status?: string; progress?: number }) => void,
  offline: boolean,
): Promise<Segmenter> {
  env.allowLocalModels = offline;
  env.allowRemoteModels = !offline;
  try {
    return await pipeline("image-segmentation", repoId, { device, dtype: modelDtype(repoId), progress_callback });
  } finally {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
  }
}

function emitPipelineProgress(modelId: string, info: { status?: string; progress?: number }) {
  const ratio = typeof info.progress === "number" ? Math.max(0, Math.min(100, info.progress)) : 0;
  const downloading = info.status === "progress" || info.status === "download" || info.status === "initiate" || info.status === "progress_total";
  if (info.status === "progress_total") {
    emitModelDownload(modelId, Math.round(ratio));
  }
  emitLoadingProgress(8 + Math.round(ratio * 0.6), downloading ? "下载模型" : "加载模型");
}

function getPipeline(modelId: string): Promise<Segmenter> {
  let promise = transformersPipelines.get(modelId);
  if (!promise) {
    promise = (async () => {
      const progress_callback = (info: { status?: string; progress?: number }) => emitPipelineProgress(modelId, info);
      const offlineReady = await essentialsCached(modelId);
      const create = async (device: "webgpu" | "wasm", offline: boolean) => {
        const created = await createPipeline(modelId, device, progress_callback, offline);
        pipelineDevices.set(modelId, device);
        log("info", `pipeline ready ${modelId} device=${device} executionProviders=[${device}]`);
        return created;
      };
      if (await hasWebGPU()) {
        try {
          log("info", `pipeline create ${modelId} device=webgpu ${offlineReady ? "(offline)" : "(remote ok)"}`);
          return await create("webgpu", offlineReady);
        } catch (error) {
          if (offlineReady && error instanceof ModelFileNotFoundError) {
            log("warn", `${modelId} 本地缓存不完整（${String(error)}），改为联网加载`);
            return await create("webgpu", false);
          }
          log("warn", `${modelId} webgpu 初始化失败，回退 CPU：${String(error)}`);
          webgpuAvailable = false;
        }
      }
      log("info", `pipeline create ${modelId} device=wasm`);
      return await create("wasm", offlineReady);
    })().catch((error) => {
      transformersPipelines.delete(modelId);
      pipelineDevices.delete(modelId);
      throw error;
    });
    transformersPipelines.set(modelId, promise);
  }
  return promise;
}

// ---- anime-seg（ISNet，手動接 ONNX）----

const ANIMESEG_URL = "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx";
const ANIMESEG_SIZE = 1024;

let animeSegSession: Promise<ort.InferenceSession> | null = null;

function getAnimeSegSession(): Promise<ort.InferenceSession> {
  if (!animeSegSession) {
    animeSegSession = (async () => {
      const stored = await readCachedModel(ANIMESEG_URL);
      let buffer: Uint8Array | null = null;
      if (stored) {
        const bytes = new Uint8Array(await stored.arrayBuffer());
        if (bytes.length >= 16 && bytes[0] !== 0x3c) buffer = bytes;
      }
      if (!buffer) {
        log("info", "anime-seg downloading…");
        const response = await fetch(ANIMESEG_URL);
        if (!response.ok || !response.body) throw new Error(`anime-seg 下载失败 ${response.status}`);
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) throw new Error("anime-seg 下载到的不是模型文件");
        const total = Number(response.headers.get("content-length")) || 0;
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.byteLength;
          if (total > 0) {
            const ratio = Math.min(1, loaded / total);
            emitModelDownload("animeseg", Math.round(ratio * 100));
            emitLoadingProgress(8 + Math.round(ratio * 60), "下载模型");
          }
        }
        buffer = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if (buffer.length < 16 || buffer[0] === 0x3c) throw new Error("anime-seg 下载到的不是模型文件");
        writeCachedModel(ANIMESEG_URL, new Blob([buffer as unknown as BlobPart]));
      }
      log("info", "anime-seg weights ready, creating session…");
      // WebGPU 優先（asyncify 版 wasm 內置完整 WebGpu EP），失敗回退 wasm
      const useGpu = await hasWebGPU();
      let session: ort.InferenceSession;
      try {
        session = await ort.InferenceSession.create(buffer, { executionProviders: [useGpu ? "webgpu" : "wasm"] });
        log("info", `anime-seg session ready (${useGpu ? "webgpu" : "wasm"})`);
      } catch (error) {
        if (!useGpu) throw error;
        log("warn", `anime-seg webgpu 初始化失败，回退 wasm：${String(error)}`);
        session = await ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
        log("info", "anime-seg session ready (wasm)");
      }
      return session;
    })().catch((error) => {
      animeSegSession = null;
      throw error;
    });
  }
  return animeSegSession;
}

// ---- 遮罩合成 ----

interface MaskLike {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

class EmptyMaskError extends Error {}

function compositeWithMaskCanvas(bitmap: ImageBitmap, maskCanvas: OffscreenCanvas): Promise<Blob | null> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(bitmap, 0, 0);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  return canvas.convertToBlob({ type: "image/png" });
}

async function compositeWithMask(bitmap: ImageBitmap, mask: MaskLike): Promise<Blob | null> {
  const maskCanvas = new OffscreenCanvas(mask.width, mask.height);
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
  return compositeWithMaskCanvas(bitmap, maskCanvas);
}

// ---- 推理 ----

async function runTransformersModel(modelId: string, blob: Blob, bitmap: ImageBitmap, jobId: number, report: (progress: CutoutProgress) => void): Promise<Blob | null> {
  report({ percent: 8, label: "加载模型" });
  loadingJobIds.add(jobId);
  let segmenter: Segmenter;
  try {
    segmenter = await getPipeline(modelId);
  } finally {
    loadingJobIds.delete(jobId);
  }
  report({ percent: 74, label: "推理中" });
  log("info", `pipeline run ${modelId} device=${pipelineDevices.get(modelId) ?? "unknown"}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let results: any[];
  try {
    results = await segmenter(blob) as any[];
  } catch (error) {
    if (pipelineDevices.get(modelId) !== "webgpu") throw error;
    log("warn", `${modelId} WebGPU 推理失败，释放会话并回退 CPU：${String(error)}`);
    transformersPipelines.delete(modelId);
    pipelineDevices.delete(modelId);
    webgpuAvailable = false;
    try {
      await segmenter.dispose?.();
    } catch {
      // The broken GPU session is already detached and will be garbage collected.
    }
    report({ percent: 40, label: "CPU 回退加载" });
    loadingJobIds.add(jobId);
    try {
      segmenter = await getPipeline(modelId);
    } finally {
      loadingJobIds.delete(jobId);
    }
    report({ percent: 74, label: "CPU 重试推理" });
    log("info", `pipeline retry ${modelId} device=${pipelineDevices.get(modelId) ?? "unknown"}`);
    results = await segmenter(blob) as any[];
  }
  const mask: MaskLike | undefined = results[0]?.mask;
  if (!mask || !mask.data.some((value) => value > 16)) throw new EmptyMaskError();
  return compositeWithMask(bitmap, mask);
}

async function runAnimeSeg(bitmap: ImageBitmap, jobId: number, report: (progress: CutoutProgress) => void): Promise<Blob | null> {
  report({ percent: 8, label: "加载模型" });
  loadingJobIds.add(jobId);
  let session: ort.InferenceSession;
  try {
    session = await getAnimeSegSession();
  } finally {
    loadingJobIds.delete(jobId);
  }
  report({ percent: 74, label: "推理中" });

  // 與官方 inference.py 一致：等比縮放裝進 1024 方形、居中、其餘補零，僅做 /255
  const s = ANIMESEG_SIZE;
  const scale = Math.min(s / bitmap.width, s / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const pw = s - w;
  const ph = s - h;

  const prepCanvas = new OffscreenCanvas(s, s);
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
  log("info", "anime-seg inference done");
  const pred = output[outputName].data as Float32Array;

  // 裁掉補零區，縮放回原始尺寸作為 8-bit mask
  const cropCanvas = new OffscreenCanvas(w, h);
  const cropContext = cropCanvas.getContext("2d");
  if (!cropContext) return null;
  const cropData = cropContext.createImageData(w, h);
  let hasForeground = false;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (ph / 2 + y) * s + (pw / 2 + x);
      const value = Math.round(Math.max(0, Math.min(1, pred[src])) * 255);
      if (value > 16) hasForeground = true;
      const dst = (y * w + x) * 4;
      cropData.data[dst] = 255;
      cropData.data[dst + 1] = 255;
      cropData.data[dst + 2] = 255;
      cropData.data[dst + 3] = value;
    }
  }
  if (!hasForeground) throw new EmptyMaskError();
  cropContext.putImageData(cropData, 0, 0);

  const maskCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const maskContext = maskCanvas.getContext("2d");
  if (!maskContext) return null;
  maskContext.imageSmoothingEnabled = true;
  maskContext.drawImage(cropCanvas, 0, 0, bitmap.width, bitmap.height);
  return compositeWithMaskCanvas(bitmap, maskCanvas);
}

// ---- session 生命週期（內存治理）----

/** 每個模型權重 id 的在飛任務數；歸零後才允許執行掛起的釋放。 */
const sessionRefs = new Map<string, number>();
const disposePending = new Set<string>();

function acquire(weightId: string): void {
  sessionRefs.set(weightId, (sessionRefs.get(weightId) ?? 0) + 1);
}

function release(weightId: string): void {
  const next = (sessionRefs.get(weightId) ?? 1) - 1;
  if (next > 0) {
    sessionRefs.set(weightId, next);
    return;
  }
  sessionRefs.delete(weightId);
  if (disposePending.has(weightId)) {
    disposePending.delete(weightId);
    void disposeSessions(weightId);
  }
}

async function disposeSessions(weightId: string): Promise<void> {
  if (weightId === "animeseg") {
    const promise = animeSegSession;
    if (!promise) return;
    animeSegSession = null;
    try {
      await (await promise).release();
    } catch {
      // 釋放失敗僅影響內存，不影響後續重建成 session
    }
    return;
  }
  const promise = transformersPipelines.get(weightId);
  pipelineDevices.delete(weightId);
  if (!promise) return;
  transformersPipelines.delete(weightId);
  try {
    const segmenter = await promise;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (segmenter as any)?.dispose?.();
  } catch {
    // 同上，靜默處理
  }
}

/** 切換摳像模型後釋放其他模型的推理會話（anime-seg 176MB / BiRefNet 450MB 不再常駐）。 */
function pruneSessions(keep: CutoutModel): void {
  const keepId = modelWeightId(keep);
  const known = new Set<string>(transformersPipelines.keys());
  if (animeSegSession) known.add("animeseg");
  for (const weightId of known) {
    if (weightId === keepId) continue;
    if (sessionRefs.has(weightId)) disposePending.add(weightId);
    else void disposeSessions(weightId);
  }
}

/** 空閒一段時間後釋放全部會話；下次使用從本地緩存快速重建。 */
const IDLE_RELEASE_MS = 10 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function touchActivity(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = undefined;
    if (sessionRefs.size > 0) {
      touchActivity();
      return;
    }
    const known = [...transformersPipelines.keys(), ...(animeSegSession ? ["animeseg"] : [])];
    if (known.length === 0) return;
    for (const weightId of known) {
      void disposeSessions(weightId);
    }
    log("info", "idle: cutout sessions released");
  }, IDLE_RELEASE_MS);
}

// ---- 消息處理 ----

async function runJob(message: Extract<CutoutClientMessage, { type: "run" }>): Promise<void> {
  const { jobId, imageUrl, model } = message;
  const weightId = modelWeightId(model);
  const report = (progress: CutoutProgress) => post({ type: "progress", jobId, percent: progress.percent, label: progress.label });
  runs.set(jobId, { progress: report });
  acquire(weightId);
  touchActivity();
  let bitmap: ImageBitmap | null = null;
  try {
    report({ percent: 5, label: "读取图片" });
    const response = await fetch(imageUrl);
    if (response.status === 404 || response.status === 410) {
      post({ type: "run-done", jobId, blob: null, failure: "source-missing" });
      return;
    }
    if (!response.ok) throw new Error(`读取图片失败（${response.status}）`);
    const blob = await response.blob();
    bitmap = await createImageBitmap(blob);
    let outBlob: Blob | null = null;
    switch (model) {
      case "modnet":
        outBlob = await runTransformersModel("Xenova/modnet", blob, bitmap, jobId, report);
        break;
      case "animeseg":
        outBlob = await runAnimeSeg(bitmap, jobId, report);
        break;
      default:
        outBlob = await runTransformersModel(BIREFNET_MODEL_ID, blob, bitmap, jobId, report);
        break;
    }
    report({ percent: 92, label: "合成遮罩" });
    if (!outBlob) {
      post({
        type: "run-done",
        jobId,
        blob: null,
        error: `${cutoutModelInfo(model).name} 抠像合成失败，请重试`,
        failure: "error",
      });
      return;
    }
    post({ type: "run-done", jobId, blob: outBlob, model });
  } catch (error) {
    if (error instanceof EmptyMaskError) {
      log("info", `empty mask: ${model}`);
      post({ type: "run-done", jobId, blob: null, failure: "empty-mask" });
      return;
    }
    log("warn", `failed: ${model} ${String(error)}`);
    post({ type: "run-done", jobId, blob: null, error: classifyCutoutError(model, error), failure: "error" });
  } finally {
    runs.delete(jobId);
    loadingJobIds.delete(jobId);
    bitmap?.close();
    release(weightId);
    touchActivity();
  }
}

async function preloadModel(message: Extract<CutoutClientMessage, { type: "preload" }>): Promise<void> {
  const weightId = modelWeightId(message.model);
  acquire(weightId);
  touchActivity();
  try {
    if (message.model === "animeseg") await getAnimeSegSession();
    else await getPipeline(weightId);
    post({ type: "preload-done", jobId: message.jobId });
  } catch (error) {
    post({ type: "preload-done", jobId: message.jobId, error: String(error) });
  } finally {
    release(weightId);
  }
}

let workQueue: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): void {
  workQueue = workQueue.then(work).catch((error) => {
    log("warn", `queued task failed: ${String(error)}`);
  });
}

ctx.addEventListener("message", (event) => {
  const message = event.data as CutoutClientMessage;
  switch (message?.type) {
    case "run":
      enqueue(() => runJob(message));
      break;
    case "preload":
      enqueue(() => preloadModel(message));
      break;
    case "cache-match-res": {
      const reply = cacheReplies.get(message.reqId);
      cacheReplies.delete(message.reqId);
      reply?.(message.blob ?? null);
      break;
    }
    case "prune":
      pruneSessions(message.keep);
      break;
  }
});

touchActivity();
