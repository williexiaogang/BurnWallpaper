import { convertFileSrc } from "@tauri-apps/api/core";
import { backend, isTauri, type CutoutRecord } from "../backend";
import { isCutoutModel, type CutoutModel } from "./cutout-models";

export interface StoredCutout {
  url: string;
  model: CutoutModel;
}

const memoryUrls = new Map<string, string>();

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

async function loadBrowser(id: string, source: string): Promise<StoredCutout | null> {
  const db = await openBrowserStore();
  const record = await new Promise<{ blob: Blob; model: string; source: string } | undefined>((resolve, reject) => {
    const request = db.transaction("cuts").objectStore("cuts").get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!record || record.source !== source || !isCutoutModel(record.model)) return null;
  const cached = memoryUrls.get(id);
  if (cached) return { url: cached, model: record.model };
  const url = URL.createObjectURL(record.blob);
  memoryUrls.set(id, url);
  return { url, model: record.model };
}

async function saveBrowser(id: string, source: string, blob: Blob, model: CutoutModel): Promise<string> {
  const db = await openBrowserStore();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("cuts", "readwrite").objectStore("cuts").put({ blob, model, source }, id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
  const previous = memoryUrls.get(id);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(blob);
  memoryUrls.set(id, url);
  return url;
}

function fromRecord(record: CutoutRecord, source: string): StoredCutout | null {
  if (record.source !== source || !isCutoutModel(record.model)) return null;
  return { url: convertFileSrc(record.path), model: record.model };
}

export async function loadCutout(id: string, source: string): Promise<StoredCutout | null> {
  if (!isTauri) return loadBrowser(id, source);
  const record = await backend.readCutout(id);
  return record ? fromRecord(record, source) : null;
}

export async function saveCutout(id: string, source: string, blobUrl: string, model: CutoutModel): Promise<string> {
  const blob = await fetch(blobUrl).then((response) => response.blob());
  if (!isTauri) return saveBrowser(id, source, blob, model);
  const path = await backend.writeCutout(id, await blobToBase64(blob), model, source);
  return convertFileSrc(path);
}
