import { useCallback, useSyncExternalStore } from "react";
import type { Wallpaper } from "../types";
import { peekCutout } from "../utils/cutout-cache";
import { forceCutout, getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-jobs";
import type { CutoutModel } from "../utils/cutout-models";

export type CutoutState = "disabled" | "pending" | "failed" | "ready";

export interface CutoutResult {
  state: CutoutState;
  url: string | null;
  /** 實際產出結果的模型（可能與當前選擇不同——緩存復用） */
  modelUsed?: CutoutModel;
  /** Classified failure reason when state === "failed". */
  error?: string;
  /** Present while this wallpaper is the one being computed. */
  progress?: { percent: number; label: string };
  /** Bust the saved result and run segmentation again with the currently selected model. */
  recompute: () => void;
}

/**
 * Foreground cutout for layering text behind the character.
 * The queue in cutout-jobs owns the work, so leaving this page does not stop it.
 * A saved result is reused across model switches until recompute().
 */
export function useCutout(wallpaper: Wallpaper, enabled: boolean, model: CutoutModel): CutoutResult {
  const jobs = useSyncExternalStore(subscribeCutoutJobs, getCutoutJobSnapshot);
  const cached = peekCutout(wallpaper.id, wallpaper.image, 0);
  const running = jobs.progress?.wallpaperId === wallpaper.id ? jobs.progress : undefined;
  const error = jobs.errors[wallpaper.id];
  const recompute = useCallback(() => {
    forceCutout(wallpaper, model);
  }, [wallpaper, model]);

  if (!enabled) return { state: "disabled", url: null, recompute };
  if (running) {
    return {
      state: "pending",
      url: cached?.url ?? null,
      modelUsed: cached?.model,
      progress: { percent: running.percent, label: running.label },
      recompute,
    };
  }
  if (cached) return { state: "ready", url: cached.url, modelUsed: cached.model, recompute };
  if (error) return { state: "failed", url: null, error, recompute };
  return { state: "pending", url: null, recompute };
}
