import { useCallback, useEffect, useState } from "react";
import type { Wallpaper } from "../types";
import { peekCutout } from "../utils/cutout-cache";
import type { CutoutModel } from "../utils/cutout-models";
import { logError } from "../utils/logger";

export type CutoutState = "disabled" | "pending" | "failed" | "ready";

export interface CutoutResult {
  state: CutoutState;
  url: string | null;
  /** 實際產出結果的模型（可能與當前選擇不同——緩存復用） */
  modelUsed?: CutoutModel;
  /** Classified failure reason when state === "failed". */
  error?: string;
  /** Bust the cache and run segmentation again with the currently selected model. */
  recompute: () => void;
}

/**
 * Foreground cutout for layering text behind the character.
 * 結果按圖片緩存（與模型無關）：任何模型摳成功後，切換模型不會重新摳像；
 * recompute 才會用當前選中的模型重算。
 */
export function useCutout(wallpaper: Wallpaper, enabled: boolean, model: CutoutModel): CutoutResult {
  const cachedOnMount = peekCutout(wallpaper.id, wallpaper.image, 0);
  const [state, setState] = useState<CutoutState>(!enabled ? "disabled" : cachedOnMount ? "ready" : "pending");
  const [url, setUrl] = useState<string | null>(cachedOnMount?.url ?? null);
  const [modelUsed, setModelUsed] = useState<CutoutModel | undefined>(cachedOnMount?.model);
  const [error, setError] = useState<string | undefined>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState("disabled");
      setUrl(null);
      setModelUsed(undefined);
      setError(undefined);
      return;
    }
    const cached = peekCutout(wallpaper.id, wallpaper.image, nonce);
    if (cached) {
      setUrl(cached.url);
      setModelUsed(cached.model);
      setError(undefined);
      setState("ready");
      return;
    }
    let alive = true;
    setState("pending");
    setUrl(null);
    setModelUsed(undefined);
    setError(undefined);
    (async () => {
      const { getCutout } = await import("../utils/cutout");
      const outcome = await getCutout(wallpaper.id, wallpaper.image, model, nonce);
      if (!alive) return;
      setUrl(outcome.url);
      setModelUsed(outcome.model);
      if (outcome.url) {
        setState("ready");
      } else {
        const reason = outcome.error ?? "未知原因";
        setError(reason);
        setState("failed");
        logError("cutout", "人物抠像失败", `${wallpaper.id} · ${reason}`);
      }
    })();
    return () => { alive = false; };
  }, [wallpaper.id, wallpaper.image, enabled, model, nonce]);

  const recompute = useCallback(() => {
    setNonce((current) => current + 1);
  }, []);

  return { state, url, modelUsed, error, recompute };
}
