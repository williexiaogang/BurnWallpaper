import { modelRel, readModel, writeModel } from "./model-store";

// Apache-2.0 LaMa ONNX, pinned to the export revision and its LFS SHA-256.
const MODEL_URL = "https://huggingface.co/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx";
const MODEL_HASH = "1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6";
const MODEL_SIZE = 208044816;
const CACHE_VERSION = "lama-preview-v1";
const CACHE_LIMIT = 6;
export type InpaintStatus = "checking" | "downloading" | "loading" | "inference" | "saving";

async function digest(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("burn-parallax-backgrounds", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("backgrounds", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(key: string): Promise<Blob | null> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("backgrounds").objectStore("backgrounds").get(key);
      request.onsuccess = () => resolve(request.result?.blob instanceof Blob ? request.result.blob : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function writeCache(key: string, blob: Blob): Promise<void> {
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("backgrounds", "readwrite"), store = tx.objectStore("backgrounds");
      const all = store.getAll();
      all.onsuccess = () => {
        const entries = (all.result as { key: string; created: number }[]).filter((entry) => entry.key !== key).sort((a, b) => b.created - a.created);
        for (const entry of entries.slice(CACHE_LIMIT - 1)) store.delete(entry.key);
        store.put({ key, blob, created: Date.now() });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("保存背景缓存失败"));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function modelBytes(signal: AbortSignal, status: (value: InpaintStatus) => void): Promise<ArrayBuffer> {
  const path = modelRel(MODEL_URL);
  if (!path) throw new Error("背景模型地址无效");
  status("loading");
  let blob = await readModel(path).catch(() => null);
  signal.throwIfAborted();
  if (!blob || blob.size !== MODEL_SIZE || await digest(blob) !== MODEL_HASH) {
    status("downloading");
    const response = await fetch(MODEL_URL, { signal });
    if (!response.ok) throw new Error(`背景模型下载失败：HTTP ${response.status}`);
    blob = await response.blob();
    signal.throwIfAborted();
    if (blob.size !== MODEL_SIZE || await digest(blob) !== MODEL_HASH) throw new Error("背景模型校验失败，请检查网络后重试");
    signal.throwIfAborted();
    await writeModel(path, blob);
  }
  signal.throwIfAborted();
  return blob.arrayBuffer();
}

export async function prepareParallaxBackground(imageUrl: string, subjectUrl: string, signal: AbortSignal, status: (value: InpaintStatus) => void): Promise<Blob> {
  status("checking");
  const [imageResponse, subjectResponse] = await Promise.all([fetch(imageUrl, { signal }), fetch(subjectUrl, { signal })]);
  if (!imageResponse.ok || !subjectResponse.ok) throw new Error("读取原图或抠像失败");
  const [image, subject] = await Promise.all([imageResponse.blob(), subjectResponse.blob()]);
  const [imageHash, subjectHash] = await Promise.all([digest(image), digest(subject)]);
  signal.throwIfAborted();
  const key = `${CACHE_VERSION}:${imageHash}:${subjectHash}`;
  const cached = await readCache(key).catch(() => null);
  signal.throwIfAborted();
  if (cached) return cached;
  const model = await modelBytes(signal, status);
  signal.throwIfAborted();
  const background = await new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/inpaint.worker.ts", import.meta.url), { type: "module" });
    const abort = () => { worker.terminate(); reject(new DOMException("已取消背景补全", "AbortError")); };
    const finish = () => { signal.removeEventListener("abort", abort); worker.terminate(); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ type: string; blob?: Blob; message?: string }>) => {
      if (event.data.type === "progress") status("inference");
      if (event.data.type === "done") { finish(); event.data.blob ? resolve(event.data.blob) : reject(new Error("没有生成背景")); }
      if (event.data.type === "error") { finish(); reject(new Error(event.data.message ?? "背景补全失败")); }
    };
    worker.onerror = (event) => { finish(); reject(new Error(event.message || "背景补全线程失败")); };
    worker.postMessage({ image, subject, model }, [model]);
  });
  signal.throwIfAborted();
  status("saving");
  await writeCache(key, background).catch(() => undefined);
  signal.throwIfAborted();
  return background;
}
