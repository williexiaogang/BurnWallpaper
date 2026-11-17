import { convertFileSrc } from "@tauri-apps/api/core";
import { backend, isTauri } from "../backend";
import { logInfo, logWarn } from "./logger";

export { modelRel } from "./model-path";

const CHUNK = 256 * 1024;
const LOG_AT = 1024 * 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

const writing = new Map<string, Promise<void>>();

export function writeModel(rel: string, blob: Blob): Promise<void> {
  const previous = writing.get(rel) ?? Promise.resolve();
  const task = previous.then(() => writeModelNow(rel, blob));
  writing.set(rel, task.then(() => undefined, () => undefined));
  return task;
}

async function writeModelNow(rel: string, blob: Blob): Promise<void> {
  if (blob.size === 0) throw new Error("模型文件是空的");
  if (isTauri) await writeTauri(rel, blob);
  else await writeBrowser(rel, blob);
  if (blob.size >= LOG_AT) logInfo("cutout", "模型已保存到本地", rel);
}

async function writeTauri(rel: string, blob: Blob): Promise<void> {
  await backend.modelWriteBegin(rel);
  // 原生二進制 IPC 分塊直寫：模型最大 450MB，base64 路徑會在主線程構建等量字符串。
  // 用流式讀取 + 1MB 緩衝，峰值內存恆定，不隨模型大小增長。
  const BATCH = 1024 * 1024;
  try {
    const reader = blob.stream().getReader();
    let buffer = new Uint8Array(BATCH);
    let filled = 0;
    const flush = async () => {
      if (filled > 0) await backend.modelWriteChunkRaw(rel, buffer.subarray(0, filled));
      buffer = new Uint8Array(BATCH);
      filled = 0;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      let offset = 0;
      while (offset < value.length) {
        const take = Math.min(BATCH - filled, value.length - offset);
        buffer.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === BATCH) await flush();
      }
    }
    await flush();
    await backend.modelWriteFinish(rel);
  } catch (error) {
    console.warn("[cutout] 原生写入模型失败，回退 base64", error);
    try {
      // 回退舊路徑（慢但可靠）；modelWriteBegin 會重建分片文件，覆蓋原生路徑的殘留
      await backend.modelWriteBegin(rel);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let index = 0; index < bytes.length; index += CHUNK) {
        await backend.modelWriteChunk(rel, bytesToBase64(bytes.subarray(index, index + CHUNK)));
      }
      await backend.modelWriteFinish(rel);
    } catch (fallbackError) {
      await backend.modelWriteAbort(rel).catch(() => undefined);
      throw fallbackError;
    }
  }
}

function openBrowserStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("burn-models", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeBrowser(rel: string, blob: Blob): Promise<void> {
  const db = await openBrowserStore();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("files", "readwrite").objectStore("files").put(blob, rel);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

const READ_CHUNK = 8 * 1024 * 1024;

export async function readModel(rel: string): Promise<Blob | null> {
  if (!isTauri) return readBrowser(rel);
  // 分塊 IPC：450MB 權重不再一次複製進單條命令。空回應表示檔案不存在。
  try {
    const parts: ArrayBuffer[] = [];
    let offset = 0;
    for (;;) {
      const bytes = await backend.modelReadChunk(rel, offset, READ_CHUNK);
      if (!bytes || bytes.byteLength === 0) break;
      parts.push(bytes);
      offset += bytes.byteLength;
      if (bytes.byteLength < READ_CHUNK) break;
    }
    if (parts.length === 0) return null;
    return new Blob(parts);
  } catch (error) {
    logWarn("cutout", "读取本地模型失败，改用 asset 回退", `${rel} · ${String(error)}`);
  }
  try {
    const path = await backend.modelFilePath(rel);
    if (!path) return null;
    const response = await fetch(convertFileSrc(path));
    if (!response.ok) {
      logWarn("cutout", "asset 读取模型失败", `${rel} · HTTP ${response.status}`);
      return null;
    }
    return await response.blob();
  } catch (error) {
    logWarn("cutout", "asset 读取模型异常", `${rel} · ${String(error)}`);
    return null;
  }
}

async function readBrowser(rel: string): Promise<Blob | null> {
  const db = await openBrowserStore();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").get(rel);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob instanceof Blob && blob.size > 0 ? blob : null;
}

export async function migrateBrowserCache(url: string, rel: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open("transformers-cache");
    const hit = await cache.match(url);
    if (!hit) return null;
    const blob = await hit.blob();
    if (blob.size < 16) return null;
    try {
      await writeModel(rel, blob);
    } catch (error) {
      console.warn("[cutout] migrate model cache failed", rel, error);
    }
    return blob;
  } catch {
    return null;
  }
}
