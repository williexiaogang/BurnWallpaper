import { useEffect, useSyncExternalStore } from "react";
import { ensureThumb, peekThumb, subscribeThumbs } from "../utils/thumb-store";

export type ImageLoadError = (id: string, imageUrl: string) => void;

/**
 * 縮略圖 URL：優先返回 480px webp 縮略圖；生成期間返回 null（調用方回退原圖）。
 * 列表頁用它替代直接引用 4K 原圖——每張 4K 解碼後 ~37MB 紋理，十幾張就是數百 MB，
 * 還會在滾動/切換時反覆觸發重解碼。
 */
export function useThumbnailUrl(imageUrl: string, id: string, onImageError: ImageLoadError): string | null {
  const thumb = useSyncExternalStore(subscribeThumbs, () => peekThumb(imageUrl));
  useEffect(() => {
    let active = true;
    void ensureThumb(imageUrl).then((loaded) => {
      if (active && !loaded) onImageError(id, imageUrl);
    });
    return () => { active = false; };
  }, [id, imageUrl, onImageError]);
  return thumb;
}
