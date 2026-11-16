import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * 清理打包產物裡不再被引用的 ORT wasm 變體。
 * ORT 1.31 的 WebGPU 走 asyncify 構建（webgpuInit 在 asyncify mjs 膠水裡），
 * 我們在 worker 裡顯式把兩個 ORT 實例的 wasmPaths 都指向 asyncify 版；
 * jsep 變體（~28MB×2）不再被引用，若被 Vite 靜態掃描帶出來則在產物階段剔除。
 */
function pruneDeadOrtWasm(): Plugin {
  return {
    name: "prune-dead-ort-wasm",
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded\.jsep-[^/]*\.(wasm|mjs)$/.test(name)) {
          delete bundle[name];
        }
      }
    },
  };
}

/** 版本號 + 構建時間在打包時注入：版本號讀 package.json（免手動同步），時間取構建時刻。 */
function buildConstants(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version?: string };
  const buildTime = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${buildTime.getFullYear()}${pad(buildTime.getMonth() + 1)}${pad(buildTime.getDate())}.${pad(buildTime.getHours())}${pad(buildTime.getMinutes())}`;
  return {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __APP_BUILD_STAMP__: JSON.stringify(stamp),
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pruneDeadOrtWasm()],
  define: buildConstants(),
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
});
