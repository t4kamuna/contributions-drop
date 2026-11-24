// 草1マスを4つずつミノへ割り当てる。

export type Level = 0 | 1 | 2 | 3 | 4;

export interface Day {
  date: string; // YYYY-MM-DD
  count: number;
  level: Level; // 0 = 草なし
}

export interface Calendar {
  weeks: number; // 草の列数 = 盤面の幅
  days: Day[];
}

/**
 * 草が1以上ある日を古い順に並べ、4日ずつに区切る。
 * 4で割り切れない最後のミノは、足りないマスをレベル0で埋める（形はそのまま残す）。
 */
export function chunkCells(days: Day[]): Level[][] {
  const levels = [...days]
    .filter((d) => d.level > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => d.level);
  const out: Level[][] = [];
  for (let i = 0; i < levels.length; i += 4) {
    const chunk = levels.slice(i, i + 4);
    while (chunk.length < 4) chunk.push(0);
    out.push(chunk);
  }
  return out;
}
