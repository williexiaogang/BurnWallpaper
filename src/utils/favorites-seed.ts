export interface FavoriteSeedInput {
  stored: string[];
  seededFlag: string | null;
  hasGenerated: boolean;
  hasOtherSettings: boolean;
  seedIds: string[];
}

export interface FavoriteSeedDecision {
  ids: string[];
  persistSeedFlag: boolean;
  toggleOn: string[];
}

/**
 * Seed the two bundled favorites only on a genuinely new library.
 * An empty favorites table after the user cleared it, or after any other saved setting, stays empty.
 */
export function decideFavorites(input: FavoriteSeedInput): FavoriteSeedDecision {
  if (input.stored.length > 0) {
    return { ids: input.stored, persistSeedFlag: input.seededFlag !== "1", toggleOn: [] };
  }
  const used = input.seededFlag === "1" || input.hasGenerated || input.hasOtherSettings;
  if (used) {
    return { ids: [], persistSeedFlag: input.seededFlag !== "1", toggleOn: [] };
  }
  return { ids: [...input.seedIds], persistSeedFlag: true, toggleOn: [...input.seedIds] };
}
