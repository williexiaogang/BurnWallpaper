import { build } from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const tmp = await mkdtemp(join(tmpdir(), "burn-presets-"));
const outfile = join(tmp, "validate.mjs");

const source = `
import presetData from "./src/style-presets/index.ts";
import { combinePacks, runPresetTests, resolveStylePromptDetailed } from "./src/utils/prompt.ts";
import { parseStylePresetImport } from "./src/utils/preset-json.ts";

const presets = presetData;
let failed = 0;
const forbidden = [
  "glossy", "brush", "subsurface", "cross-hatching", "impasto", "bokeh",
  "cel-shad", "3d render", "cinematic", "poster art", "halftone", "speed lines",
  "rim lighting", "shallow depth of field", "painterly", "vector", "engraving",
  "ink wash", "volumetric",
];

for (const preset of presets) {
  if (preset.id !== "free") {
    try {
      parseStylePresetImport(JSON.stringify(preset), []);
      console.log("IMPORT OK   | " + preset.id);
    } catch (error) {
      failed++;
      console.error("IMPORT FAIL | " + preset.id + " | " + error.message);
    }
  }
  for (const result of runPresetTests(preset)) {
    const line = (result.passed ? "TEST PASS  | " : "TEST FAIL  | ") + preset.id + " | " + result.name;
    if (result.passed) console.log(line);
    else { failed++; console.error(line + " | " + result.failures.join("; ")); }
  }
  for (const [name, variable] of Object.entries(preset.variables ?? {})) {
    if (variable.group !== "content") continue;
    for (const option of variable.options) {
      for (const word of forbidden) {
        if (option.value.toLowerCase().includes(word)) {
          failed++;
          console.error("CONTENT WORD | " + preset.id + " | " + name + " | " + option.value + " | " + word);
        }
      }
    }
  }
}
console.log(failed ? "FAILED: " + failed + " issue(s)" : "ALL OK");

if (process.argv.includes("--samples")) {
  const stylePacks = presets.filter((item) => item.kind === "style");
  const combinedFor = (contentId, artStyle) => {
    const content = presets.find((item) => item.id === contentId);
    const style = stylePacks.find((pack) => pack.variables.ART_STYLE.options.some((option) => option.value === artStyle));
    return content && style ? combinePacks(content, style) : undefined;
  };
  const samples = [
    { ART_STYLE: "fluffy 3D animated-film CGI", BODY_BUILD: "a chubby rounded build with short limbs", ANIMAL: "cat", FRAMING: "full body" },
    { ART_STYLE: "flat mid-century screen-print poster illustration", BODY_BUILD: "a tall lean angular frame", ANIMAL: "tiger", FRAMING: "from mid-thigh up" },
    { ART_STYLE: "storybook gouache illustration", BODY_BUILD: "an oversized head with a small plush body", ANIMAL: "fox", FRAMING: "close-up on face and shoulders" },
    { ART_STYLE: "minimalist flat conceptual illustration", BODY_BUILD: "a petite chibi frame", ANIMAL: "rabbit", FRAMING: "full body" },
  ];
  for (const [index, select] of samples.entries()) {
    const general = combinedFor("general", select.ART_STYLE);
    if (!general) { failed++; console.error("SAMPLE FAIL | " + select.ART_STYLE); continue; }
    const result = resolveStylePromptDetailed(general, select, () => 0.37);
    console.log("\\n--- SAMPLE " + (index + 1) + " | " + select.ART_STYLE + " ---\\n" + result.prompt);
  }

  const NL = String.fromCharCode(10);
  const conceptSamples = [
    { ART_STYLE: "minimalist flat conceptual illustration", MOTIF: "a school of small fish swimming against the current", SCENE: "a deep underwater void", MATERIAL: "a subtle paper grain texture with fine fiber detail", BACKDROP: "with a monochromatic color field and a single contrasting warm accent", LIGHTING: "soft diffuse light falling from one corner" },
    { ART_STYLE: "flat mid-century screen-print poster illustration", MOTIF: "overlapping translucent arcs", SCENE: "an empty color field", BACKDROP: "with a flat solid vivid orange filling the backdrop" },
    { ART_STYLE: "fluffy 3D animated-film CGI", MOTIF: "a cluster of tiny glowing orbs", SCENE: "a limitless night sky", MATERIAL: "volumetric forms with refined shading" },
    { ART_STYLE: "storybook gouache illustration", MOTIF: "layered mountain silhouettes", SCENE: "a mountain ridge at dawn", MATERIAL: "visible brush strokes and gouache texture" },
  ];
  const conceptRng = [0.37, 0.62, 0.15, 0.88];
  for (const [index, select] of conceptSamples.entries()) {
    const concept = combinedFor("concept", select.ART_STYLE);
    if (!concept) { failed++; console.error("CONCEPT FAIL | " + select.ART_STYLE); continue; }
    const result = resolveStylePromptDetailed(concept, select, () => conceptRng[index] ?? 0.37);
    console.log(NL + "--- CONCEPT " + (index + 1) + " | " + select.ART_STYLE + " ---" + NL + result.prompt);
  }
}
process.exit(failed ? 1 : 0);
`;

await build({
  stdin: { contents: source, resolveDir: root, sourcefile: "validate-entry.ts", loader: "ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "silent",
});

await import(pathToFileURL(outfile).href);
