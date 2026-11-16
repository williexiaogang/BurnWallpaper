import { env } from "@huggingface/transformers";
import { convertFileSrc } from "@tauri-apps/api/core";
import { backend, isTauri } from "../backend";
import { logInfo } from "./logger";

const CHUNK = 256 * 1024;
const LOG_AT = 1024 * 1024;

/** Hugging Face 权重地址 → data_dir/models 下的相对路径。非法路径返回 null。 */
export function modelRel(cacheKey: string): string | null {
  let url: URL;
  try {
    url = new URL(cacheKey);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (url.hostname === "huggingface.co") {
    const resolveAt = parts.indexOf("resolve");
    if (resolveAt < 2 || resolveAt + 2 >= parts.length) return null;
    const repo = parts.slice(0, resolveAt);
    const revision = parts[resolveAt + 1];
    const file = parts.slice(resolveAt + 2);
    return joinRel(["hf", ...repo, revision, ...file]);
  }
  return joinRel(["ext", url.hostname, ...parts]);
}

function joinRel(parts: string[]): string | null {
  if (parts.length === 0 || parts.length > 12) return null;
  if (parts.some((part) => !/^[A-Za-z0-9._@+-]+$/.test(part))) return null;
  return parts.join("/");
}

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
  const reader = blob.stream().getReader();
  const writeBytes = async (bytes: Uint8Array) => {
    for (let index = 0; index < bytes.length; index += CHUNK) {
      await backend.modelWriteChunk(rel, bytesToBase64(bytes.subarray(index, index + CHUNK)));
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await writeBytes(value);
    }
    await backend.modelWriteFinish(rel);
  } catch (error) {
    await backend.modelWriteAbort(rel).catch(() => undefined);
    throw error;
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

export async function readModel(rel: string): Promise<Blob | null> {
  if (!isTauri) return readBrowser(rel);
  const path = await backend.modelFilePath(rel);
  if (!path) return null;
  const response = await fetch(convertFileSrc(path));
  if (!response.ok) return null;
  return response.blob();
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

async function migrateBrowserCache(url: string, rel: string): Promise<Blob | null> {
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

/** transformers.js 的模型文件改存到应用目录（浏览器开发时用 IndexedDB）。 */
export function installModelCache(): void {
  env.useCustomCache = true;
  env.customCache = {
    async match(request: string) {
      const rel = modelRel(request);
      if (!rel) return undefined;
      const local = await readModel(rel) ?? await migrateBrowserCache(request, rel);
      if (!local) return undefined;
      return new Response(local, { headers: { "content-length": String(local.size) } });
    },
    async put(request: string, response: Response) {
      const rel = modelRel(request);
      if (!rel) return;
      if (await readModel(rel)) return;
      await writeModel(rel, await response.blob());
    },
  };
}
