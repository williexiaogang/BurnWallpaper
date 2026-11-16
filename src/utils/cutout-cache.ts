import type { CutoutModel } from "./cutout-models";

export interface CachedCutout {
  url: string;
  model: CutoutModel;
}

/** 內存中最多保留的摳像結果數（LRU）。4K PNG 一張可達 5–20MB，無上限會持續增長。 */
const MAX_CACHE = 12;

const successCache = new Map<string, CachedCutout>();
const inflight = new Map<string, Promise<unknown>>();

export function cutoutCacheKey(wallpaperId: string, imageUrl: string, model: CutoutModel, nonce = 0): string {
  return `${wallpaperId}\n${model}\n${nonce}\n${imageUrl}`;
}

/** 同步讀取這個模型已經成功的摳像。別的模型的結果不算。 */
export function peekCutout(wallpaperId: string, imageUrl: string, model: CutoutModel, nonce = 0): CachedCutout | undefined {
  const key = cutoutCacheKey(wallpaperId, imageUrl, model, nonce);
  const hit = successCache.get(key);
  if (hit) {
    // LRU 觸碰：移到末尾。活躍壁紙每次渲染都會讀，不會被驅逐。
    successCache.delete(key);
    successCache.set(key, hit);
  }
  return hit;
}

export function readInflight<T>(key: string): Promise<T> | undefined {
  return inflight.get(key) as Promise<T> | undefined;
}

export function writeInflight(key: string, task: Promise<unknown>): void {
  inflight.set(key, task);
}

export function clearInflight(key: string): void {
  inflight.delete(key);
}

function revoke(url: string): void {
  // asset://（convertFileSrc 產物）不是 blob URL，無需也不應 revoke
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

export function storeCutout(key: string, value: CachedCutout): void {
  const previous = successCache.get(key);
  successCache.delete(key);
  successCache.set(key, value);
  // 同一 URL 重複入庫（例如隊列重啟後重新載入本地結果）時不能 revoke 自己
  if (previous && previous.url !== value.url) revoke(previous.url);
  while (successCache.size > MAX_CACHE) {
    const oldest = successCache.keys().next().value;
    if (oldest === undefined) break;
    const entry = successCache.get(oldest);
    successCache.delete(oldest);
    if (entry) revoke(entry.url);
  }
}

/** 刪除壁紙時清掉它在記憶體中的全部摳像結果（含 blob URL 釋放）。 */
export function dropCutoutsFor(wallpaperId: string): void {
  const prefix = `${wallpaperId}\n`;
  for (const [key, entry] of [...successCache]) {
    if (key.startsWith(prefix)) {
      successCache.delete(key);
      revoke(entry.url);
    }
  }
}
