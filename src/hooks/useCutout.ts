import { useCallback, useEffect, useState } from "react";
import type { Wallpaper } from "../types";
import type { CutoutModel } from "../utils/cutout";

export type CutoutState = "disabled" | "pending" | "failed" | "ready";

export interface CutoutResult {
  state: CutoutState;
  url: string | null;
  /** Bust the cache and run segmentation again. */
  recompute: () => void;
}

/** Foreground cutout for layering text behind the character, with explicit state so the UI can distinguish off / pending / failed / ready. */
export function useCutout(wallpaper: Wallpaper, enabled: boolean, model: CutoutModel): CutoutResult {
  const [state, setState] = useState<CutoutState>(enabled ? "pending" : "disabled");
  const [url, setUrl] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setState("disabled");
      setUrl(null);
      return;
    }
    let alive = true;
    setState("pending");
    setUrl(null);
    (async () => {
      const { getCutout } = await import("../utils/cutout");
      const result = await getCutout(wallpaper.id, wallpaper.image, model, nonce);
      if (!alive) return;
      setUrl(result);
      setState(result ? "ready" : "failed");
    })();
    return () => { alive = false; };
  }, [wallpaper.id, wallpaper.image, enabled, model, nonce]);

  const recompute = useCallback(() => {
    setNonce((current) => current + 1);
  }, []);

  return { state, url, recompute };
}
