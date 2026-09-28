/** Data model for a card in the vault, plus the small helpers the UI needs to render it. */

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];

export interface Card {
  id: string;
  name: string;
  /** Mana cost in curly-brace notation, e.g. "{2}{U}{U}". Empty for lands. */
  manaCost: string;
  typeLine: string;
  rulesText: string;
  rarity: Rarity;
  collectorNumber: string;
  setName: string;
  /** JPEG data URL of the cropped card art, downscaled for storage. */
  image: string;
  quantity: number;
  notes: string;
  addedAt: string;
  addedBy: string;
}

/** What the card reader returns before the user reviews it. */
export type DraftCard = Omit<Card, 'id' | 'addedAt' | 'addedBy' | 'quantity' | 'notes'> & {
  quantity: number;
  notes: string;
};

/** Visual family a card belongs to. Drives glow color and filters. */
export type Family = ManaColor | 'multi' | 'colorless' | 'land';

export const FAMILY_LABEL: Record<Family, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green',
  multi: 'Multicolor',
  colorless: 'Colorless',
  land: 'Land',
};

export const FAMILIES: Family[] = ['W', 'U', 'B', 'R', 'G', 'multi', 'colorless', 'land'];

/** Split "{2}{U}{U}" into ["2", "U", "U"]. Tolerates sloppy input like "2UU". */
export function manaSymbols(cost: string): string[] {
  const trimmed = cost.trim();
  if (!trimmed) return [];
  const braces = trimmed.match(/\{([^}]+)\}/g);
  if (braces) return braces.map((b) => b.slice(1, -1).toUpperCase());
  return trimmed.toUpperCase().split('').filter((c) => /[0-9WUBRGCXT]/.test(c));
}

export function colorsOf(card: Pick<Card, 'manaCost' | 'typeLine'>): ManaColor[] {
  const found = new Set<ManaColor>();
  for (const sym of manaSymbols(card.manaCost)) {
    for (const ch of sym.split('/')) {
      if (ch === 'W' || ch === 'U' || ch === 'B' || ch === 'R' || ch === 'G') found.add(ch);
    }
  }
  return ['W', 'U', 'B', 'R', 'G'].filter((c): c is ManaColor => found.has(c as ManaColor));
}

export function familyOf(card: Pick<Card, 'manaCost' | 'typeLine'>): Family {
  const colors = colorsOf(card);
  if (colors.length > 1) return 'multi';
  if (colors.length === 1) return colors[0];
  if (/\bland\b/i.test(card.typeLine)) return 'land';
  return 'colorless';
}

export function isShiny(card: Pick<Card, 'rarity'>): boolean {
  return card.rarity === 'rare' || card.rarity === 'mythic';
}

export function newId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${rand}`;
}

export function normalizeRarity(value: string | undefined): Rarity {
  const v = (value ?? '').toLowerCase();
  if (v.startsWith('m')) return 'mythic';
  if (v.startsWith('r')) return 'rare';
  if (v.startsWith('u')) return 'uncommon';
  return 'common';
}
