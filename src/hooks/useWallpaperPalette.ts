import { useEffect, useRef, useState } from "react";
import { getPalette } from "colorthief";
import type { Wallpaper } from "../types";

interface WallpaperPalette {
  accent: string;
  titleColor: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function useWallpaperPalette(wallpaper: Wallpaper): WallpaperPalette {
  const [palette, setPalette] = useState<WallpaperPalette | null>(null);
  const cache = useRef(new Map<string, WallpaperPalette>());

  useEffect(() => {
    const cached = cache.current.get(wallpaper.image);
    if (cached) {
      setPalette(cached);
      return;
    }
    const controller = new AbortController();
    setPalette(null);

    const extract = async () => {
      try {
        // 统一 fetch 成 blob（命中浏览器 HTTP 缓存，asset:// 也走这条路），
        // 再用 createImageBitmap 直接解成 256px 小图：解码与缩放在浏览器内部线程完成。
        // 旧实现用 new Image() + drawImage，会在主线程完整解码一次 4K 原图（每次切换阻塞数百毫秒）。
        const response = await fetch(wallpaper.image);
        if (!response.ok) throw new Error("Image loading failed");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        const bitmap = await createImageBitmap(blob, { resizeWidth: 256, resizeQuality: "low" });
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(bitmap, 0, 0);
          const colors = await getPalette(canvas, {
            colorCount: 8,
            quality: 1,
            colorSpace: "oklch",
            minSaturation: 0.12,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const candidates = colors
            ?.map((color) => ({
              color,
              ...color.oklch(),
              proportion: color.proportion,
            }))
            .filter((color) =>
              Number.isFinite(color.h) && color.c >= 0.07 && color.l >= 0.42 &&
              color.color.contrast.black >= 3.5 && color.proportion >= 0.005,
            )
            .sort((a, b) => {
              const score = (item: typeof a) => item.c * 3 + Math.sqrt(item.proportion) * 0.6 - Math.abs(item.l - 0.68) * 0.25;
              return score(b) - score(a);
            });
          const selected = candidates?.[0];
          if (!selected) return;
          const lightness = clamp(selected.l, 0.64, 0.78);
          const chroma = clamp(selected.c, 0.1, 0.2);
          const next = {
            accent: `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${selected.h.toFixed(2)})`,
            titleColor: `oklch(0.93 ${Math.min(chroma, 0.035).toFixed(3)} ${selected.h.toFixed(2)})`,
          };
          cache.current.set(wallpaper.image, next);
          setPalette(next);
        } finally {
          bitmap.close();
        }
      } catch {
        if (!controller.signal.aborted) setPalette(null);
      }
    };

    void extract();
    return () => controller.abort();
  }, [wallpaper.image]);

  return palette ?? { accent: wallpaper.accent, titleColor: wallpaper.titleColor };
}
