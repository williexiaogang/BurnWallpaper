import { useCallback, useSyncExternalStore } from "react";
import type { Wallpaper } from "../types";
import { isTauri } from "../backend";
import { peekCutout } from "../utils/cutout-cache";
import { getCutoutJobSnapshot, subscribeCutoutJobs } from "../utils/cutout-job-store";
import type { CutoutModel } from "../utils/cutout-models";

export type CutoutState = "disabled" | "pending" | "failed" | "empty" | "ready";

export interface CutoutResult {
  state: CutoutState;
  url: string | null;
  /** 實際產生目前模型結果的模型。 */
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
 * The queue in cutout-jobs owns the native work; web builds only read the empty job store.
 */
export function useCutout(wallpaper: Wallpaper, enabled: boolean, model: CutoutModel): CutoutResult {
  const jobs = useSyncExternalStore(subscribeCutoutJobs, getCutoutJobSnapshot);
  const cached = isTauri ? peekCutout(wallpaper.id, wallpaper.image, model) : null;
  const running = jobs.progress?.wallpaperId === wallpaper.id && jobs.progress.model === model ? jobs.progress : undefined;
  const failure = jobs.errors[`${wallpaper.id}\n${model}`];
  const recompute = useCallback(() => {
    if (isTauri) void import("../utils/cutout-jobs").then((queue) => queue.forceCutout(wallpaper, model));
  }, [wallpaper, model]);

  if (!isTauri || !enabled) return { state: "disabled", url: null, recompute };
  if (running) {
    return {
      state: "pending",
      url: cached?.url ?? null,
      modelUsed: cached?.model,
      progress: { percent: running.percent, label: running.label },
      recompute,
    };
  }
  if (failure?.kind === "empty-mask") return { state: "empty", url: null, recompute };
  if (failure) return { state: "failed", url: cached?.url ?? null, modelUsed: cached?.model, error: failure.message, recompute };
  if (cached) return { state: "ready", url: cached.url, modelUsed: cached.model, recompute };
  return { state: "pending", url: null, recompute };
}
