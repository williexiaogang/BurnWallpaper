import type { CutoutModel } from "./cutout-models";

export interface CachedCutout {
  url: string;
  model: CutoutModel;
}

const successCache = new Map<string, CachedCutout>();
const inflight = new Map<string, Promise<unknown>>();

export function cutoutCacheKey(wallpaperId: string, imageUrl: string, model: CutoutModel, nonce = 0): string {
  return `${wallpaperId}\n${model}\n${nonce}\n${imageUrl}`;
}

/** 同步讀取這個模型已經成功的摳像。別的模型的結果不算。 */
export function peekCutout(wallpaperId: string, imageUrl: string, model: CutoutModel, nonce = 0): CachedCutout | undefined {
  return successCache.get(cutoutCacheKey(wallpaperId, imageUrl, model, nonce));
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
