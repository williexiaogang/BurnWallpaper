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
    const image = new Image();

    const extract = async () => {
      let src = wallpaper.image;
      let objectUrl: string | null = null;
      try {
        // asset:// URLs cross origins in dev and would taint the canvas; fetch to a blob first.
        if (/^(asset:|https?:\/\/asset\.localhost)/.test(src)) {
          const response = await fetch(src);
          objectUrl = URL.createObjectURL(await response.blob());
          src = objectUrl;
        }
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("Image loading failed"));
          image.src = src;
          if (image.complete && image.naturalWidth > 0) resolve();
        });
        const scale = 256 / Math.max(image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
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
      } catch {
        if (!controller.signal.aborted) setPalette(null);
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    };

    void extract();
    return () => controller.abort();
  }, [wallpaper.image]);

  return palette ?? { accent: wallpaper.accent, titleColor: wallpaper.titleColor };
}
