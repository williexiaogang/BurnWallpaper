import { modelRel, readModel, writeModel } from "./model-store";

// Real-ESRGAN x4v3 ONNX export; model pinned by commit and LFS SHA-256.
const MODEL_URL = "https://huggingface.co/thisismert/real-esrgan-onnx/resolve/238b42ef61dcf2cd2c8b3632208ae29b847f194d/onnx/realesr-general-x4v3.onnx";
const MODEL_SHA256 = "5518a106453e751655edc12f208973207ab8355d0cafc1816b8a9041b01810dd";
async function verified(blob: Blob): Promise<boolean> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("") === MODEL_SHA256;
}
async function modelBytes(signal?: AbortSignal): Promise<ArrayBuffer> {
  const path = modelRel(MODEL_URL);
  if (!path) throw new Error("模型地址无效");
  let blob = await readModel(path).catch(() => null);
  if (!blob || !(await verified(blob))) {
    const response = await fetch(MODEL_URL, { signal });
    if (!response.ok) throw new Error(`模型下载失败：HTTP ${response.status}`);
    blob = await response.blob();
    if (!(await verified(blob))) throw new Error("模型校验失败，请重试");
    await writeModel(path, blob);
  }
  return blob.arrayBuffer();
}
export async function upscaleWallpaper(imageUrl: string, width: number, height: number, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<Blob | null> {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) throw new Error(`读取图片失败：HTTP ${response.status}`);
  const image = await response.blob();
  const bitmap = await createImageBitmap(image);
  const needsUpscale = bitmap.width < width || bitmap.height < height;
  bitmap.close();
  if (!needsUpscale) return null;
  const model = await modelBytes(signal);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/upscale.worker.ts", import.meta.url), { type: "module" });
    const abort = () => { worker.terminate(); reject(new DOMException("已取消放大", "AbortError")); };
    const finish = () => { signal?.removeEventListener("abort", abort); worker.terminate(); };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ type: string; percent?: number; blob?: Blob | null; message?: string }>) => {
      if (event.data.type === "progress") onProgress(event.data.percent ?? 0);
      if (event.data.type === "done") { finish(); resolve(event.data.blob ?? null); }
      if (event.data.type === "error") { finish(); reject(new Error(event.data.message ?? "放大失败")); }
    };
    worker.onerror = (event) => { finish(); reject(new Error(event.message || "放大线程失败")); };
    worker.postMessage({ image, model, targetWidth: width, targetHeight: height }, [model]);
  });
}
