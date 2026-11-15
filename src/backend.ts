import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Wallpaper } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface GenRecord {
  id: string;
  issue: number;
  title: string;
  english: string;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
  imagePath: string;
  createdAt: number;
}

export interface GenerationError {
  kind: string;
  message: string;
}

export interface MonitorInfo {
  devicePath: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface BalanceInfo {
  balanceUsd: number;
  balanceMicrodollars: number;
}

export interface StorageDirInfo {
  path: string;
  isDefault: boolean;
}

export interface PendingRequest {
  requestId: string;
  model: string;
  prompt: string;
  styleName: string;
  resolution: string;
  aspectRatio: string;
  createdAt: number;
}

export function recordToWallpaper(record: GenRecord): Wallpaper {
  const [w = 1, h = 1] = record.aspectRatio.split(":").map(Number);
  const image = convertFileSrc(record.imagePath);
  return {
    id: record.id,
    styleId: "generated",
    accent: "#FF4D1A",
    titleColor: "#F2EFE9",
    issue: String(record.issue).padStart(2, "0"),
    title: record.title,
    english: record.english,
    tags: ["新图", record.resolution],
    image,
    localPath: record.imagePath,
    resolution: `${record.resolution} · ${record.aspectRatio}`,
    subject: "AI 生成",
    tone: "原色",
    light: "暗色",
    ratio: w > h ? "wide" : w < h ? "portrait" : "standard",
  };
}

export interface GeneratePayload {
  model: string;
  prompt: string;
  resolution: string;
  aspectRatio: string;
  styleName: string;
}

async function urlToBase64(url: string): Promise<{ dataBase64: string; fileName: string }> {
  const response = await fetch(url);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const fileName = (url.split("/").pop() || "wallpaper.png").split("?")[0];
  return { dataBase64: btoa(binary), fileName };
}

export const backend = {
  hasApiKey: () => invoke<boolean>("has_api_key"),
  saveApiKey: (key: string) => invoke<void>("save_api_key", { key }),
  deleteApiKey: () => invoke<void>("delete_api_key"),
  testConnection: () => invoke<BalanceInfo>("test_connection"),
  submitGeneration: (payload: GeneratePayload) => invoke<string>("submit_generation", { payload }),
  cancelGeneration: (requestId: string) => invoke<void>("cancel_generation", { requestId }),
  listGenerated: () => invoke<GenRecord[]>("list_generated_wallpapers"),
  listFavorites: () => invoke<string[]>("list_favorites"),
  toggleFavorite: (id: string) => invoke<boolean>("toggle_favorite", { id }),
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  getAppSetting: (key: string) => invoke<string | null>("get_app_setting", { key }),
  setAppSetting: (key: string, value: string) => invoke<void>("set_app_setting", { key, value }),
  listPendingRequests: () => invoke<PendingRequest[]>("list_pending_requests"),
  discardPendingRequest: (requestId: string) => invoke<void>("discard_pending_request", { requestId }),
  recoverGeneration: (requestId: string) => invoke<GenRecord>("recover_generation", { requestId }),
  deleteWallpapers: (ids: string[]) => invoke<number>("delete_wallpapers", { ids }),
  exportTextFile: (fileName: string, content: string) =>
    invoke<string | null>("export_text_file", { payload: { fileName, content } }),
  getStorageDir: () => invoke<StorageDirInfo>("get_storage_dir"),
  pickStorageDir: () => invoke<StorageDirInfo>("pick_storage_dir"),
  resetStorageDir: () => invoke<StorageDirInfo>("reset_storage_dir"),
  apply: async (wallpaper: Wallpaper, monitorId: string | null) => {
    if (wallpaper.localPath) {
      await invoke<void>("apply_wallpaper", { payload: { path: wallpaper.localPath, monitorId } });
      return;
    }
    const { dataBase64, fileName } = await urlToBase64(wallpaper.image);
    await invoke<void>("apply_wallpaper", { payload: { dataBase64, fileName, monitorId } });
  },
};
