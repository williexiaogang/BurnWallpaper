import type { Theme } from "./engine.ts";
import library from "./scene-library.json" with { type: "json" };

const names: Readonly<Record<string, string>> = library.categories;

export const sceneCategoryName = (id: string) => Object.hasOwn(names, id) ? names[id] : id;

export function sceneCategories(theme: Theme) {
  const available = new Set(theme.variables.SCENE?.options
    .filter((option) => (option.weight ?? 1) > 0)
    .flatMap((option) => option.categories ?? []));
  return [...Object.keys(names).filter((id) => available.delete(id)), ...available];
}

export function sceneOptions(theme: Theme, category?: string) {
  const options = theme.variables.SCENE?.options ?? [];
  return category ? options.filter((option) => option.categories?.includes(category)) : options;
}

export function scopeScenes(theme: Theme, category?: string): Theme {
  if (!category) return theme;

  const options = sceneOptions(theme, category);
  if (!options.some((option) => (option.weight ?? 1) > 0)) {
    throw new Error(`「${sceneCategoryName(category)}」分类没有可抽取的场景，请选择其他分类。`);
  }
  return { ...theme, variables: { ...theme.variables, SCENE: { ...theme.variables.SCENE, options } } };
}
