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
  folder: string;
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
  /** Still being polled by the background worker; no manual recovery needed. */
  active: boolean;
}

export interface FolderInfo {
  id: string;
  name: string;
  count: number;
}

export function recordToWallpaper(record: GenRecord): Wallpaper {
  const [w = 1, h = 1] = record.aspectRatio.split(":").map(Number);
  const image = convertFileSrc(record.imagePath);
  const tags = extractTags(record.prompt);
  return {
    id: record.id,
    styleId: "generated",
    accent: "#FF4D1A",
    titleColor: "#F2EFE9",
    issue: String(record.issue).padStart(2, "0"),
    title: record.title,
    english: record.english,
    tags: tags.length ? tags : [record.title],
    image,
    localPath: record.imagePath,
    resolution: `${record.resolution} · ${record.aspectRatio}`,
    subject: "AI 生成",
    tone: "原色",
    light: "暗色",
    ratio: w > h ? "wide" : w < h ? "portrait" : "standard",
  };
}

const TAG_KEYWORDS: [string, string][] = [
  ["german shepherd", "德牧"], ["wolf", "狼"], ["tiger", "虎"], ["lion", "狮"],
  ["cheetah", "猎豹"], ["panther", "豹"], ["leopard", "豹"], ["bear", "熊"],
  ["fox", "狐"], ["hyena", "鬣狗"], ["lynx", "猞猁"], ["jaguar", "美洲豹"],
  ["cougar", "美洲狮"], ["husky", "哈士奇"], ["doberman", "杜宾"], ["akita", "秋田"],
  ["raccoon", "浣熊"], ["badger", "獾"], ["otter", "水獭"], ["mink", "貂"],
  ["forest", "森林"], ["beach", "海边"], ["shrine", "神社"], ["rooftop", "天台"],
  ["dojo", "道场"], ["gym", "健身房"], ["boxing", "拳击"], ["street", "街头"],
  ["rain", "雨夜"], ["sneaker", "球鞋"], ["boots", "靴"], ["jacket", "夹克"], ["hoodie", "帽衫"],
];

function extractTags(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const tags: string[] = [];
  for (const [keyword, label] of TAG_KEYWORDS) {
    if (tags.length >= 3) break;
    if (lower.includes(keyword) && !tags.includes(label)) tags.push(label);
  }
  return tags;
}

export interface CutoutRecord {
  path: string;
  model: string;
  source: string;
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
  listFolders: () => invoke<FolderInfo[]>("list_folders"),
  createFolder: (name: string) => invoke<FolderInfo>("create_folder", { name }),
  deleteFolder: (id: string) => invoke<void>("delete_folder", { id }),
  setWallpaperFolder: (wallpaperId: string, folderId: string | null) =>
    invoke<GenRecord>("set_wallpaper_folder", { wallpaperId, folderId }),
  enhancePrompt: (prompt: string) => invoke<string>("enhance_prompt", { prompt }),
  exportTextFile: (fileName: string, content: string) =>
    invoke<string | null>("export_text_file", { payload: { fileName, content } }),
  readCutout: (wallpaperId: string, model: string) => invoke<CutoutRecord | null>("read_cutout", { wallpaperId, model }),
  writeCutout: (wallpaperId: string, pngBase64: string, model: string, source: string) =>
    invoke<string>("write_cutout", { wallpaperId, pngBase64, model, source }),
  modelFilePath: (rel: string) => invoke<string | null>("model_file_path", { rel }),
  modelWriteBegin: (rel: string) => invoke<void>("model_write_begin", { rel }),
  modelWriteChunk: (rel: string, dataBase64: string) => invoke<void>("model_write_chunk", { rel, dataBase64 }),
  modelWriteFinish: (rel: string) => invoke<void>("model_write_finish", { rel }),
  modelWriteAbort: (rel: string) => invoke<void>("model_write_abort", { rel }),
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
