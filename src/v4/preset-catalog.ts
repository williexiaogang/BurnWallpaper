import { parseV4, type Library, type Theme } from "./engine.ts";
import { parseStudioCatalog, type PublishedStudioRecipe } from "./studio-catalog.ts";

export const MAX_PRESET_BYTES = 2 * 1024 * 1024;

export interface OfficialPresets {
  schema_version: 4;
  revision: number;
  themes: Theme[];
  library: Library;
  studio?: PublishedStudioRecipe[];
}

export function parseOfficialPresets(source: string): OfficialPresets {
  const data: unknown = JSON.parse(source);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("官方预设包格式错误");
  const { schema_version, revision, themes, library, studio } = data as Record<string, unknown>;
  if (schema_version !== 4) throw new Error("官方预设包格式与此版本不兼容");
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("官方预设版本号无效");
  }
  if (!Array.isArray(themes) || !themes.length) throw new Error("官方预设包缺少主题");
  if (!library) throw new Error("官方预设包缺少画风库");

  const parsedLibrary = parseV4(JSON.stringify(library));
  if (parsedLibrary.kind !== "style_library") throw new Error("官方预设包缺少画风库");
  const styleIds = new Set(parsedLibrary.styles.map(({ id }) => `${parsedLibrary.id}/${id}`));
  const themeIds = new Set<string>();
  const parsedThemes = themes.map((item) => {
    const theme = parseV4(JSON.stringify(item));
    if (theme.kind !== "prompt_scheme") throw new Error("官方预设包含无效主题");
    if (themeIds.has(theme.id)) throw new Error(`官方主题 ID 重复：${theme.id}`);
    themeIds.add(theme.id);
    if (theme.style?.mode !== "embedded") {
      const recommended = theme.style?.recommended;
      if (!recommended?.length || recommended.some((id) => !styleIds.has(id))) {
        throw new Error(`官方主题 ${theme.id} 的推荐画风缺失`);
      }
    }
    return theme;
  });

  return { schema_version, revision, themes: parsedThemes, library: parsedLibrary,
    ...(studio !== undefined ? { studio: parseStudioCatalog(studio) } : {}),
  };
}
