// シード付き乱数と 7-bag（7種を1セットにして毎回シャッフルする出現順）。

import { PIECE_TYPES, type PieceType } from "./pieces.js";

/** 文字列から 32bit のシードを作る（FNV-1a）。 */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32。0 以上 1 未満を返す。 */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 7-bag で count 個のミノの並びを作る。 */
export function bagSequence(count: number, random: () => number): PieceType[] {
  const out: PieceType[] = [];
  while (out.length < count) {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    out.push(...bag);
  }
  return out.slice(0, count);
}
