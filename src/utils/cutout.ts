import { env, pipeline } from "@huggingface/transformers";
import * as ort from "onnxruntime-web";

export type CutoutModel = "birefnet" | "modnet" | "animeseg";

export const CUTOUT_MODELS: { id: CutoutModel; name: string; hint: string }[] = [
  { id: "birefnet", name: "BiRefNet", hint: "通用顯著主體，插畫兼容好（預設）" },
  { id: "modnet", name: "MODNet", hint: "人像特化，模型最小速度快" },
  { id: "animeseg", name: "anime-seg", hint: "二次元角色專訓，APACHE-2.0" },
];

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Segmenter = any;

const transformersPipelines = new Map<string, Promise<Segmenter>>();
const resultCache = new Map<string, Promise<string | null>>();

function getPipeline(modelId: string): Promise<Segmenter> {
  let promise = transformersPipelines.get(modelId);
  if (!promise) {
    // BiRefNet_lite 倉庫只有 fp32/fp16 權重，沒有 quantized，必須明確指定 fp32
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = modelId.includes("BiRefNet") ? { dtype: "fp32" } : undefined;
    promise = pipeline("image-segmentation", modelId, options).catch((error) => {
      transformersPipelines.delete(modelId);
      throw error;
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

function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d unavailable");
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

// ---- transformers.js 模型（BiRefNet / MODNet） ----

async function runTransformersModel(modelId: string, bitmap: ImageBitmap): Promise<string | null> {
  const segmenter = await getPipeline(modelId);
  // RawImage.read 不接受 ImageBitmap，轉成 ImageData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await segmenter(bitmapToImageData(bitmap)) as any[];
  const mask: MaskLike | undefined = results[0]?.mask;
  if (!mask) return null;
  return compositeWithMask(bitmap, mask);
}

// ---- anime-seg（ISNet，手動接 ONNX） ----

const ANIMESEG_URL = "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx";
const ANIMESEG_SIZE = 1024;

let animeSegSession: Promise<ort.InferenceSession> | null = null;

function getAnimeSegSession(): Promise<ort.InferenceSession> {
  if (!animeSegSession) {
    animeSegSession = (async () => {
      const response = await fetch(ANIMESEG_URL);
      const buffer = await response.arrayBuffer();
      return ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
    })().catch((error) => {
      animeSegSession = null;
      throw error;
    });
  }
  return animeSegSession;
}

async function runAnimeSeg(bitmap: ImageBitmap): Promise<string | null> {
  const session = await getAnimeSegSession();

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
  const gray = new Uint8Array(mask.width * mask.height);
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = mask.data[i * 4 + 3];
  }

  return compositeWithMask(bitmap, { data: gray, width: mask.width, height: mask.height });
}

// ---- 統一入口 ----

/** Returns an object URL of the foreground cutout PNG, or null on failure. Cached per model + wallpaper id + nonce. */
export function getCutout(wallpaperId: string, imageUrl: string, model: CutoutModel, nonce = 0): Promise<string | null> {
  const cacheKey = `${model}:${wallpaperId}:${nonce}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  const task = (async (): Promise<string | null> => {
    try {
      const bitmap = await fetchBitmap(imageUrl);
      switch (model) {
        case "modnet":
          return await runTransformersModel("Xenova/modnet", bitmap);
        case "animeseg":
          return await runAnimeSeg(bitmap);
        default:
          return await runTransformersModel("onnx-community/BiRefNet_lite-ONNX", bitmap);
      }
    } catch (error) {
      console.warn("[cutout] failed:", model, error);
      return null;
    }
  })();

  resultCache.set(cacheKey, task);
  return task;
}
