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
  const core = presets.find((item) => item.id === "core");
  const generalContent = presets.find((item) => item.id === "general");
  const general = generalContent && core ? combinePacks(generalContent, core) : undefined;
  const samples = [
    { ART_STYLE: "fluffy 3D animated-film CGI", BODY_BUILD: "a chubby rounded build with short limbs", ANIMAL: "cat", FRAMING: "full body" },
    { ART_STYLE: "flat mid-century screen-print poster illustration", BODY_BUILD: "a tall lean angular frame", ANIMAL: "tiger", FRAMING: "from mid-thigh up" },
    { ART_STYLE: "storybook gouache illustration", BODY_BUILD: "an oversized head with a small plush body", ANIMAL: "fox", FRAMING: "close-up on face and shoulders" },
    { ART_STYLE: "minimalist flat conceptual illustration", BODY_BUILD: "a petite chibi frame", ANIMAL: "rabbit", FRAMING: "full body" },
  ];
  if (general) {
    for (const [index, select] of samples.entries()) {
      const result = resolveStylePromptDetailed(general, select, () => 0.37);
      console.log("\\n--- SAMPLE " + (index + 1) + " | " + select.ART_STYLE + " ---\\n" + result.prompt);
    }
  }

  const conceptContent = presets.find((item) => item.id === "concept");
  const concept = conceptContent && core ? combinePacks(conceptContent, core) : undefined;
  const NL = String.fromCharCode(10);
  const conceptSamples = [
    { ART_STYLE: "minimalist flat conceptual illustration", MOTIF: "a school of small fish swimming against the current", SCENE: "a deep underwater void", MATERIAL: "a subtle paper grain texture with fine fiber detail", BACKDROP: "with a monochromatic color field and a single contrasting warm accent", LIGHTING: "soft diffuse light falling from one corner" },
    { ART_STYLE: "flat mid-century screen-print poster illustration", MOTIF: "overlapping translucent arcs", SCENE: "an empty color field", BACKDROP: "with a flat solid vivid orange filling the backdrop" },
    { ART_STYLE: "fluffy 3D animated-film CGI", MOTIF: "a cluster of tiny glowing orbs", SCENE: "a limitless night sky", MATERIAL: "volumetric forms with refined shading" },
    { ART_STYLE: "storybook gouache illustration", MOTIF: "layered mountain silhouettes", SCENE: "a mountain ridge at dawn", MATERIAL: "visible brush strokes and gouache texture" },
  ];
  const conceptRng = [0.37, 0.62, 0.15, 0.88];
  if (concept) {
    for (const [index, select] of conceptSamples.entries()) {
      const result = resolveStylePromptDetailed(concept, select, () => conceptRng[index] ?? 0.37);
      console.log(NL + "--- CONCEPT " + (index + 1) + " | " + select.ART_STYLE + " ---" + NL + result.prompt);
    }
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
