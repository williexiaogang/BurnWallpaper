/**
 * 縮略圖存儲：IndexedDB 持久化（瀏覽器與 Tauri 通用，跨啟動生效），內存 Map 緩存 object URL（LRU）。
 * 生成在 thumb.worker 內完成，主線程零解碼開銷。鍵為原圖 URL——同一張圖換構建後 URL 變了自然重生成。
 */

const THUMB_WIDTH = 480;
const MEMORY_LIMIT = 240;
const DB_NAME = "burn-thumbs";
const STORE = "thumbs";

const listeners = new Set<() => void>();
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();
const replies = new Map<number, (blob: Blob | null) => void>();
let worker: Worker | null = null;
let nextReqId = 1;

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeThumbs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 內存命中返回縮略圖 object URL（同時觸發 LRU touch），未命中返回 null。 */
export function peekThumb(imageUrl: string): string | null {
  const hit = memory.get(imageUrl);
  if (!hit) return null;
  memory.delete(imageUrl);
  memory.set(imageUrl, hit);
  return hit;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbPut(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function remember(imageUrl: string, blob: Blob): void {
  const previous = memory.get(imageUrl);
  if (previous) URL.revokeObjectURL(previous);
  while (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined || oldest === imageUrl) break;
    const url = memory.get(oldest);
    if (url) URL.revokeObjectURL(url);
    memory.delete(oldest);
  }
  memory.set(imageUrl, URL.createObjectURL(blob));
  notify();
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/thumb.worker.ts", import.meta.url), { type: "module", name: "burn-thumb" });
    worker.addEventListener("message", (event: MessageEvent<{ reqId: number; blob: Blob | null }>) => {
      const reply = replies.get(event.data.reqId);
      replies.delete(event.data.reqId);
      reply?.(event.data.blob ?? null);
    });
  }
  return worker;
}

function generateInWorker(imageUrl: string): Promise<Blob | null> {
  const reqId = nextReqId++;
  const instance = getWorker();
  return new Promise((resolve) => {
    replies.set(reqId, resolve);
    instance.postMessage({ reqId, imageUrl, width: THUMB_WIDTH });
  });
}

/** 確保某張圖的縮略圖可用：內存 → IndexedDB → worker 生成。完成後通知訂閱者。 */
export function ensureThumb(imageUrl: string): void {
  if (!imageUrl || memory.has(imageUrl) || inflight.has(imageUrl)) return;
  const task = (async () => {
    try {
      const db = await openDB();
      const stored = await idbGet(db, imageUrl).catch(() => undefined);
      db.close();
      if (stored instanceof Blob && stored.size > 0) {
        remember(imageUrl, stored);
        return;
      }
    } catch {
      // IndexedDB 不可用（隱私模式等）時只走內存緩存
    }
    const blob = await generateInWorker(imageUrl);
    if (!blob) return;
    remember(imageUrl, blob);
    void openDB()
      .then((db) => idbPut(db, imageUrl, blob).finally(() => db.close()))
      .catch(() => undefined);
  })().finally(() => {
    inflight.delete(imageUrl);
  });
  inflight.set(imageUrl, task);
}

/** 刪除壁紙時清理對應縮略圖（內存 + IndexedDB）。 */
export function dropThumb(imageUrl: string): void {
  const url = memory.get(imageUrl);
  if (url) {
    URL.revokeObjectURL(url);
    memory.delete(imageUrl);
  }
  void openDB()
    .then((db) => idbDelete(db, imageUrl).finally(() => db.close()))
    .catch(() => undefined);
}
