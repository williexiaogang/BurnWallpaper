import { mkdirSync, writeFileSync } from "node:fs";
import { bundledPresets } from "../src/v4/bundled-presets.ts";
import { MAX_PRESET_BYTES } from "../src/v4/preset-catalog.ts";

const output = new URL("../presets/presets-v4.json", import.meta.url);
const source = JSON.stringify(bundledPresets, null, 2) + "\n";
if (Buffer.byteLength(source) > MAX_PRESET_BYTES) throw new Error("官方预设包超过 2 MB");
mkdirSync(new URL("./", output), { recursive: true });
writeFileSync(output, source);
console.log(`已导出预设第 ${bundledPresets.revision} 版到 presets/presets-v4.json`);
