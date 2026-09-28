/**
 * Card reader: sends a photo to Claude and gets back one structured record per card.
 *
 * The request is a plain fetch to the Anthropic Messages API. The Cribl platform rewrites
 * it through this app's proxy (declared in config/proxies.yml), which injects the API key
 * from the KV store. The official SDK is deliberately not used here: it manages its own
 * auth headers and transport, and inside the sandboxed iframe the platform owns both.
 */
import { crop, dataUrlParts, downscale, encodeUnder, type Box } from './image';
import { isMockMode } from './kv';
import { normalizeRarity, type DraftCard } from '../model/card';

export const MODEL = 'claude-opus-5-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL_IMAGE_EDGE = 1568;
const STORED_IMAGE_EDGE = 640;
/** Base64 budget for a stored card image. The KV store caps a value near 100 KB and the card's text shares it. */
const STORED_IMAGE_BYTES = 72_000;

const SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          mana_cost: { type: 'string', description: 'Curly-brace notation like {2}{U}{U}. Empty string for lands.' },
          type_line: { type: 'string' },
          rules_text: { type: 'string' },
          rarity: { type: 'string', enum: ['common', 'uncommon', 'rare', 'mythic'] },
          collector_number: { type: 'string' },
          set_name: { type: 'string' },
          bbox: {
            type: 'object',
            description: 'Bounding box of the whole card in the photo, normalized 0..1 from the top-left.',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
            required: ['x', 'y', 'w', 'h'],
            additionalProperties: false,
          },
        },
        required: ['name', 'mana_cost', 'type_line', 'rules_text', 'rarity', 'collector_number', 'set_name', 'bbox'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
} as const;

const PROMPT = `This photo shows one or more Magic: The Gathering style trading cards (they may be a custom or fan-made set). For every card that is fully or mostly visible, return one record.

- name: the card title exactly as printed.
- mana_cost: the symbols in the top-right corner, in curly-brace notation ({3}, {U}, {G}{G}). Use an empty string when there is no cost (lands).
- type_line: the type bar text (e.g. "Cribl Artifact", "Land", "Basic Land - Island").
- rules_text: the text box contents, tap symbols written as {T}, mana symbols in braces. Keep line breaks.
- rarity: infer from the rarity letter in the bottom-left (C, U, R, M). Basic lands are common.
- collector_number: the number printed bottom-left (e.g. "020").
- set_name: the set or brand name printed on the card. Use "Cribl" if that is the brand shown.
- bbox: a tight bounding box around the full card face, normalized to the image size.

List cards top-to-bottom, left-to-right.`;

interface RawCard {
  name: string;
  mana_cost: string;
  type_line: string;
  rules_text: string;
  rarity: string;
  collector_number: string;
  set_name: string;
  bbox: Box;
}

export class ExtractError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ExtractError';
    this.status = status;
  }
}

function friendly(status: number, body: string): string {
  if (status === 401) return 'Claude rejected the API key. Open Settings and check the key.';
  if (status === 403 || status === 404) return 'The platform blocked the request. Is the Anthropic API key saved in Settings?';
  if (status === 429) return 'Claude is rate limited right now. Try again in a moment.';
  if (status === 529 || status >= 500) return 'Claude is temporarily overloaded. Try again in a moment.';
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    /* not JSON */
  }
  return body.slice(0, 200) || `Request failed (${status}).`;
}

async function callClaude(photo: string): Promise<RawCard[]> {
  const { mediaType, data } = dataUrlParts(photo);
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 6000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      fallbacks: 'default',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new ExtractError(friendly(res.status, text), res.status);

  const msg = JSON.parse(text) as {
    stop_reason?: string;
    stop_details?: { explanation?: string } | null;
    content?: Array<{ type: string; text?: string }>;
  };
  if (msg.stop_reason === 'refusal') {
    throw new ExtractError(msg.stop_details?.explanation ?? 'Claude declined to read this photo.');
  }
  if (msg.stop_reason === 'max_tokens') throw new ExtractError('The photo had more text than fit in one read. Try fewer cards per photo.');
  const block = msg.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!block?.text) throw new ExtractError('Claude returned no cards.');
  const parsed = JSON.parse(block.text) as { cards?: RawCard[] };
  return parsed.cards ?? [];
}

/** Canned result for `npm run dev` outside Cribl, tuned to the bundled sample photo. */
const MOCK_CARDS: RawCard[] = [
  { name: 'Cribl Copilot', mana_cost: '{3}', type_line: 'Cribl Equipment', rules_text: 'Equipped creature has "{T}: Copy target instant or sorcery spell you control. The copy gains Pipeline."\nEquip {2}', rarity: 'rare', collector_number: '020', set_name: 'Cribl', bbox: { x: 0.06, y: 0.08, w: 0.385, h: 0.41 } },
  { name: 'Cribl Edge', mana_cost: '{3}', type_line: 'Cribl Artifact', rules_text: '{1}, {T}: Draw a card.\n{T}: Create a tapped token that\'s a copy of Cribl Edge.', rarity: 'rare', collector_number: '005', set_name: 'Cribl', bbox: { x: 0.46, y: 0.08, w: 0.375, h: 0.41 } },
  { name: 'Unpatched Server', mana_cost: '', type_line: 'Land', rules_text: 'Unpatched Server enters the battlefield tapped. When it enters the battlefield, you gain 1 life.\n{T}: Add {W} or {U}.', rarity: 'common', collector_number: '092', set_name: 'Cribl', bbox: { x: 0.05, y: 0.49, w: 0.385, h: 0.43 } },
  { name: 'Island', mana_cost: '', type_line: 'Basic Land - Island', rules_text: '{T}: Add {U}.', rarity: 'common', collector_number: '072', set_name: 'Cribl', bbox: { x: 0.46, y: 0.5, w: 0.37, h: 0.42 } },
];

function saneBox(b: Box | undefined): Box | undefined {
  if (!b) return undefined;
  const ok = [b.x, b.y, b.w, b.h].every((n) => typeof n === 'number' && Number.isFinite(n));
  if (!ok || b.w < 0.05 || b.h < 0.05 || b.x < -0.05 || b.y < -0.05 || b.x + b.w > 1.05 || b.y + b.h > 1.05) return undefined;
  return { x: Math.max(0, b.x), y: Math.max(0, b.y), w: Math.min(1, b.w), h: Math.min(1, b.h) };
}

export interface ExtractResult {
  drafts: DraftCard[];
  /** Photo as sent to the model, for the review screen. */
  photo: string;
}

/**
 * Read every card in a photo. `onPhase` reports progress so the UI can narrate it.
 */
export async function extractCards(rawPhoto: string, onPhase?: (phase: string) => void): Promise<ExtractResult> {
  onPhase?.('Preparing photo');
  const photo = await downscale(rawPhoto, MODEL_IMAGE_EDGE);

  onPhase?.('Reading cards with Claude');
  let raws: RawCard[];
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 2200));
    raws = MOCK_CARDS;
  } else {
    raws = await callClaude(photo);
  }
  if (raws.length === 0) throw new ExtractError('No cards were found in that photo. Try a closer, well-lit shot.');

  onPhase?.('Cutting out card faces');
  const drafts: DraftCard[] = [];
  for (const raw of raws) {
    const box = saneBox(raw.bbox);
    const face = box ? await crop(photo, box, STORED_IMAGE_EDGE) : photo;
    const image = await encodeUnder(face, STORED_IMAGE_EDGE, STORED_IMAGE_BYTES);
    drafts.push({
      name: raw.name?.trim() || 'Unknown card',
      manaCost: raw.mana_cost?.trim() ?? '',
      typeLine: raw.type_line?.trim() ?? '',
      rulesText: raw.rules_text?.trim() ?? '',
      rarity: normalizeRarity(raw.rarity),
      collectorNumber: raw.collector_number?.trim() ?? '',
      setName: raw.set_name?.trim() || 'Cribl',
      image,
      quantity: 1,
      notes: '',
    });
  }
  return { drafts, photo };
}
