import { parseOfficialPresets } from "./preset-catalog.ts";
import version from "./preset-revision.json" with { type: "json" };
import theme from "./default-theme.json" with { type: "json" };
import library from "./default-styles.json" with { type: "json" };
import general from "./themes/general.json" with { type: "json" };
import concept from "./themes/concept.json" with { type: "json" };
import asian from "./themes/asian_male_studio.json" with { type: "json" };
import aj from "./themes/aj_series.json" with { type: "json" };

export const bundledPresets = parseOfficialPresets(JSON.stringify({
  schema_version: 4,
  revision: version.revision,
  themes: [general, concept, asian, aj, theme],
  library,
}));
