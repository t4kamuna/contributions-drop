// テストとプレビュー用の架空の草。API を使わずに見た目を確かめるときに使う。

import type { Calendar, Day, Level } from "./cells.js";
import { createRandom, hashSeed } from "./game/bag.js";

export function fakeCalendar(opts: { weeks?: number; density?: number; seed?: string } = {}): Calendar {
  const weeks = opts.weeks ?? 53;
  const density = opts.density ?? 0.6;
  const random = createRandom(hashSeed(opts.seed ?? "fake"));
  const start = Date.UTC(2025, 10, 23); // 日曜始まり
  const days: Day[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const active = random() < density;
    const level = (active ? 1 + Math.floor(random() * 4) : 0) as Level;
    days.push({ date, count: level * 3, level });
  }
  return { weeks, days };
}
