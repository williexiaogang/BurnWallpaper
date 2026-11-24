import { useEffect, useEffectEvent, useState } from "react";
import { loadParallaxModel, PARALLAX_CACHE_LIMIT, prepareParallaxBackground, type InpaintStatus } from "../utils/inpaint";

export interface ParallaxSource {
  image: string;
  subject: string;
}

export interface ParallaxCandidate {
  key: string;
  image: string;
  readSubject: () => Promise<string | null>;
}

interface ForegroundResult {
  key: string;
  model: Blob | null;
  background: Blob | null;
  error?: string;
  paused?: boolean;
}

const parallaxSourceKey = (source: ParallaxSource) => JSON.stringify([source.image, source.subject]);

export function useParallaxBackgrounds(active: ParallaxSource | null, others: ParallaxCandidate[], enabled: boolean) {
  const activeKey = active ? parallaxSourceKey(active) : null;
  const [model, setModel] = useState<Blob | null>(null);
  const [modelPending, setModelPending] = useState(true);
  const [downloadAttempt, setDownloadAttempt] = useState(0);
  const [modelStatus, setModelStatus] = useState<InpaintStatus | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [foreground, setForeground] = useState<ForegroundResult | null>(null);
  const [progress, setProgress] = useState<{ key: string; status: InpaintStatus } | null>(null);
  const [refreshKey, setRefreshKey] = useState<string | null>(null);
  const result = foreground?.key === activeKey ? foreground : null;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setModelPending(true);
    setModelError(null);
    setModelStatus(null);
    void loadParallaxModel(controller.signal, downloadAttempt > 0, (status) => {
      if (downloadAttempt > 0 && !controller.signal.aborted) setModelStatus(status);
    }).then((blob) => {
      if (!controller.signal.aborted) setModel(blob);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setModelError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!controller.signal.aborted) {
        setModelPending(false);
        setModelStatus(null);
      }
    });
    return () => controller.abort();
  }, [enabled, downloadAttempt]);

  const activeNeedsWork = active && !result?.background && !result?.error && !result?.paused && (!result || result.model !== model);
  const backgroundJob = enabled && model
    ? others.slice(0, PARALLAX_CACHE_LIMIT - 1).find(({ key }) => key !== activeKey && !completed.has(key))
    : null;
  const foregroundJob = enabled && activeNeedsWork ? active : null;
  const nextKey = foregroundJob ? activeKey : backgroundJob?.key ?? null;
  const image = foregroundJob?.image ?? backgroundJob?.image;
  const subject = foregroundJob?.subject;
  const refresh = nextKey !== null && nextKey === refreshKey;

  const readSubject = useEffectEvent((key: string) => others.find((source) => source.key === key)?.readSubject() ?? Promise.resolve(null));
  const settle = useEffectEvent((job: ForegroundResult) => {
    if (job.background || job.error || job.key !== activeKey) setCompleted((previous) => new Set(previous).add(job.key));
    if (job.key === activeKey) setForeground(job);
    if (job.key === refreshKey) setRefreshKey(null);
  });

  useEffect(() => {
    if (!nextKey || !image) return;
    const controller = new AbortController();
    setProgress({ key: nextKey, status: "checking" });
    const run = async () => {
      const url = subject ?? await readSubject(nextKey);
      controller.signal.throwIfAborted();
      if (!url) return null;
      return prepareParallaxBackground(image, url, controller.signal, (status) => {
        if (!controller.signal.aborted) setProgress({ key: nextKey, status });
      }, model, refresh);
    };
    void run().then((background) => {
      if (!controller.signal.aborted) settle({ key: nextKey, model, background });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        settle({ key: nextKey, model, background: null, error: error instanceof Error ? error.message : String(error) });
      }
    });
    return () => controller.abort();
  }, [nextKey, image, subject, model, refresh]);

  const retry = (refreshBackground = false) => {
    if (refreshBackground) setRefreshKey(activeKey);
    setForeground(null);
    if (!model && !modelPending) setDownloadAttempt((attempt) => attempt + 1);
  };

  const cancel = () => {
    if (modelStatus) {
      setModelStatus(null);
      setDownloadAttempt(0);
    } else if (activeKey) {
      setForeground({ key: activeKey, model, background: null, paused: true });
    }
  };

  return {
    background: result?.background ?? null,
    error: result?.error ?? modelError,
    paused: result?.paused ?? false,
    status: modelStatus ?? (nextKey === activeKey && progress?.key === activeKey ? progress.status : null),
    modelPending,
    retry,
    cancel,
  };
}
