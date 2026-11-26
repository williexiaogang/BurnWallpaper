import { parseOfficialPresets } from "./preset-catalog.ts";
import type { Option, Variable } from "./engine.ts";
import version from "./preset-revision.json" with { type: "json" };
import library from "./default-styles.json" with { type: "json" };
import general from "./themes/general.json" with { type: "json" };
import cozy from "./themes/cozy_animals.json" with { type: "json" };
import concept from "./themes/concept.json" with { type: "json" };
import asian from "./themes/asian_male_studio.json" with { type: "json" };
import sceneLibrary from "./scene-library.json" with { type: "json" };

type SceneSource = { id: string; variables: { SCENE: Omit<Variable, "options"> & { aliases: Record<string, string> } } };
const sharedScenes: Readonly<Record<string, Omit<Option, "id">>> = sceneLibrary.options;

function resolveScenes<T extends SceneSource>(source: T) {
  const { aliases, ...scene } = source.variables.SCENE;
  const legacyIds = new Map<string, string>();
  for (const [legacyId, sceneId] of Object.entries(aliases)) {
    if (!Object.hasOwn(sharedScenes, sceneId) || legacyIds.has(sceneId)) {
      throw new Error(`主题 ${source.id} 的场景引用无效或重复（${sceneId}）`);
    }
    legacyIds.set(sceneId, legacyId);
  }
  const options = Object.entries(sharedScenes).map(([sceneId, option]) => ({ id: legacyIds.get(sceneId) ?? sceneId, ...option }));
  return {
    ...source,
    variables: {
      ...source.variables,
      SCENE: { ...scene, options },
      DECORATION: { label: "场景装饰", required: false, probability: 0.15, options: sceneLibrary.decorations },
    },
  };
}

export const bundledPresets = parseOfficialPresets(JSON.stringify({
  schema_version: 4,
  revision: version.revision,
  themes: [general, cozy, concept, asian].map(resolveScenes),
  library,
}));
