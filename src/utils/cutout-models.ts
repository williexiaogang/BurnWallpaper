export type CutoutModel = "birefnet" | "modnet" | "animeseg";

export interface CutoutModelInfo {
  id: CutoutModel;
  name: string;
  /** 模型下載體積（約），用於下載確認提示 */
  sizeLabel: string;
  /** 內建小模型可直接使用；其他模型需下載 */
  big: boolean;
  hint: string;
}

export const CUTOUT_MODELS: CutoutModelInfo[] = [
  { id: "birefnet", name: "BiRefNet", sizeLabel: "约 94MB", big: true, hint: "預設模型，512×512 浏览器专用 fp16 版，WebGPU 失败时自动回退 CPU" },
  { id: "modnet", name: "MODNet", sizeLabel: "约 6MB", big: false, hint: "人像特化，模型最小速度快" },
  { id: "animeseg", name: "anime-seg", sizeLabel: "约 176MB", big: true, hint: "二次元角色專訓，APACHE-2.0" },
];

export const DEFAULT_CUTOUT_MODEL: CutoutModel = "birefnet";

export function isCutoutModel(value: string): value is CutoutModel {
  return value === "birefnet" || value === "modnet" || value === "animeseg";
}

export function cutoutModelInfo(model: CutoutModel): CutoutModelInfo {
  return CUTOUT_MODELS.find((item) => item.id === model) ?? CUTOUT_MODELS[0];
}

/** 小模型隨時可用；大模型必須已經下載過。 */
export function cutoutModelReady(model: CutoutModel, downloaded: ReadonlySet<string>): boolean {
  return !cutoutModelInfo(model).big || downloaded.has(model);
}
