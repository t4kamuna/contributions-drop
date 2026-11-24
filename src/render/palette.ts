export interface Palette {
  empty: string; // 盤面の空きマス
  levels: [string, string, string, string]; // 草の濃さ 1〜4
  filler: string; // 4で割り切れない分を埋めたマス
  text: string; // ホールド枠の文字
  accent: string; // 見せ場の文字
  labelBg: string; // 見せ場の文字の背景
}

export const PALETTES: Record<string, Palette> = {
  "github-light": {
    empty: "#ebedf0",
    levels: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
    filler: "#d0d7de",
    text: "#59636e",
    accent: "#216e39",
    labelBg: "#ffffff",
  },
  "github-dark": {
    empty: "#161b22",
    levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
    filler: "#30363d",
    text: "#9198a1",
    accent: "#39d353",
    labelBg: "#0d1117",
  },
};

export function getPalette(name: string | undefined): Palette {
  const p = PALETTES[name ?? "github-light"];
  if (!p) throw new Error(`unknown palette: ${name} (available: ${Object.keys(PALETTES).join(", ")})`);
  return p;
}
