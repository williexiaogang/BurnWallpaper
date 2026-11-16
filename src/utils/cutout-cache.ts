import type { CutoutModel } from "./cutout-models";

export interface CachedCutout {
  url: string;
  model: CutoutModel;
}

const successCache = new Map<string, CachedCutout>();
const inflight = new Map<string, Promise<unknown>>();

export function cutoutCacheKey(wallpaperId: string, imageUrl: string, nonce: number): string {
  return `${wallpaperId}\n${nonce}\n${imageUrl}`;
}

/** 同步讀取已成功的摳像。換模型時用來跳過重算，且不牽動 ONNX。 */
export function peekCutout(wallpaperId: string, imageUrl: string, nonce = 0): CachedCutout | undefined {
  return successCache.get(cutoutCacheKey(wallpaperId, imageUrl, nonce));
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

export function storeCutout(key: string, value: CachedCutout): void {
  successCache.set(key, value);
}
