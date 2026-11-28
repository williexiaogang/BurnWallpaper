import type { CutoutFailureKind } from "./cutout-shared";
import type { CutoutModel } from "./cutout-models";

export interface CutoutJobProgress {
  wallpaperId: string;
  title: string;
  percent: number;
  label: string;
  model: CutoutModel;
}

export interface CutoutJobFailure {
  kind: CutoutFailureKind;
  message: string;
}

export interface CutoutJobSnapshot {
  progress: CutoutJobProgress | null;
  errors: Readonly<Record<string, CutoutJobFailure>>;
  pendingIds: readonly string[];
}

const listeners = new Set<() => void>();
let snapshot: CutoutJobSnapshot = { progress: null, errors: {}, pendingIds: [] };

export function subscribeCutoutJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCutoutJobSnapshot(): CutoutJobSnapshot {
  return snapshot;
}

export function publishCutoutJobs(next: CutoutJobSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}
