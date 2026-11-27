import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { bundledPresets } from "../src/v4/bundled-presets.ts";
import { MAX_PRESET_BYTES, parseOfficialPresets } from "../src/v4/preset-catalog.ts";
import { studioRecipes } from "../src/v4/studio-recipes.ts";

const output = new URL("../presets/presets-v4.json", import.meta.url);
const studio = studioRecipes.map((recipe) => ({
  ...recipe,
  thumbnailWebp: readFileSync(new URL(`../public/style-previews/${recipe.slug}.webp`, import.meta.url), "base64"),
}));
const source = JSON.stringify({ ...bundledPresets, studio }, null, 2) + "\n";
if (Buffer.byteLength(source) > MAX_PRESET_BYTES) throw new Error("官方预设包超过 2 MB");
parseOfficialPresets(source);
mkdirSync(new URL("./", output), { recursive: true });
writeFileSync(output, source);
console.log(`已导出预设第 ${bundledPresets.revision} 版到 presets/presets-v4.json`);
