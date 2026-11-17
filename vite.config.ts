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

function recoverRejectedTransformersInference(): Plugin {
  const needle = "webInferenceChain = webInferenceChain.then(run)";
  let patched = 0;
  let sawTransformers = false;
  return {
    name: "recover-rejected-transformers-inference",
    enforce: "pre",
    transform(code, id) {
      if (!/node_modules[\\/]@huggingface[\\/]transformers[\\/]/.test(id)) return null;
      sawTransformers = true;
      if (!code.includes(needle)) return null;
      patched += 1;
      // Transformers 4.3.2 把推理排在上一個 Promise 後面；一次失敗會讓後續 session 永遠沿用舊 rejection。
      // 清掉前一次 rejection 後仍保留串行，CPU 回退與下一張圖才會真正執行。
      return {
        code: code.replaceAll(needle, "webInferenceChain = webInferenceChain.catch(() => undefined).then(run)"),
        map: null,
      };
    },
    buildEnd() {
      if (sawTransformers && patched === 0) throw new Error("Transformers inference retry patch did not match the bundled dependency");
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
  plugins: [react(), tailwindcss(), recoverRejectedTransformersInference(), pruneDeadOrtWasm()],
  define: buildConstants(),
  worker: { format: "es", plugins: () => [recoverRejectedTransformersInference()] },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
});
