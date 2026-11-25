import { MAX_PRESET_BYTES } from "./preset-catalog";
import { installOfficialPresets } from "./storage";

const PRESET_URL = "https://raw.githubusercontent.com/williexiaogang/BurnWallpaper/main/presets/presets-v4.json";

export async function checkPresetUpdate() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(PRESET_URL, {
      cache: "no-cache",
      credentials: "omit",
      signal: controller.signal,
    }).catch(() => { throw new Error("无法连接 GitHub"); });
    if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}`);
    if (!response.body) throw new Error("GitHub 返回的预设包为空");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let source = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PRESET_BYTES) throw new Error("官方预设包超过 2 MB");
      source += decoder.decode(value, { stream: true });
    }
    return installOfficialPresets(source + decoder.decode());
  } catch (error) {
    if (controller.signal.aborted) throw new Error("从 GitHub 下载预设超时");
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
