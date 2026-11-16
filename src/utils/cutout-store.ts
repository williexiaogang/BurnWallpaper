import { convertFileSrc } from "@tauri-apps/api/core";
import { backend, isTauri, type CutoutRecord } from "../backend";
import type { CutoutModel } from "./cutout-models";

export interface StoredCutout {
  url: string;
  model: CutoutModel;
}

const memoryUrls = new Map<string, string>();

function storeKey(id: string, model: CutoutModel): string {
  return `${id}\n${model}`;
}

function cutoutSource(localPath: string | undefined, image: string): string {
  return localPath || image;
}

export function wallpaperCutoutSource(localPath: string | undefined, image: string): string {
  return cutoutSource(localPath, image);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function openBrowserStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("burn-cutouts", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("cuts");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readBrowserRecord(id: string): Promise<{ blob: Blob; model: string; source: string } | undefined> {
  const db = await openBrowserStore();
  const record = await new Promise<{ blob: Blob; model: string; source: string } | undefined>((resolve, reject) => {
    const request = db.transaction("cuts").objectStore("cuts").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

async function loadBrowser(id: string, source: string, model: CutoutModel): Promise<StoredCutout | null> {
  const record = await readBrowserRecord(storeKey(id, model)) ?? await readBrowserRecord(id);
  if (!record || record.source !== source || record.model !== model) return null;
  const key = storeKey(id, model);
  const cached = memoryUrls.get(key);
  if (cached) return { url: cached, model };
  const url = URL.createObjectURL(record.blob);
  memoryUrls.set(key, url);
  return { url, model };
}

async function saveBrowser(id: string, source: string, blob: Blob, model: CutoutModel): Promise<string> {
  const db = await openBrowserStore();
  const key = storeKey(id, model);
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("cuts", "readwrite").objectStore("cuts").put({ blob, model, source }, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
  const previous = memoryUrls.get(key);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(blob);
  memoryUrls.set(key, url);
  return url;
}

function fromRecord(record: CutoutRecord, source: string, model: CutoutModel): StoredCutout | null {
  if (record.source !== source || record.model !== model) return null;
  return { url: convertFileSrc(record.path), model };
}

export async function loadCutout(id: string, source: string, model: CutoutModel): Promise<StoredCutout | null> {
  if (!isTauri) return loadBrowser(id, source, model);
  const record = await backend.readCutout(id, model);
  return record ? fromRecord(record, source, model) : null;
}

export async function saveCutout(id: string, source: string, blobUrl: string, model: CutoutModel): Promise<string> {
  const blob = await fetch(blobUrl).then((response) => response.blob());
  if (!isTauri) return saveBrowser(id, source, blob, model);
  // 首選原生二進制 IPC：4K PNG 有 5–20MB，舊的 base64 路徑會在主線程逐塊構建字符串，每次阻塞數百毫秒
  try {
    const path = await backend.writeCutoutRaw(id, await blob.arrayBuffer(), model, source);
    return convertFileSrc(path);
  } catch (error) {
    console.warn("[cutout] 原生写入抠像失败，回退 base64", error);
    const path = await backend.writeCutout(id, await blobToBase64(blob), model, source);
    return convertFileSrc(path);
  }
}
