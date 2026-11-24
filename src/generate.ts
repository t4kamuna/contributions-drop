// 草のデータから SVG を作るまでの共通処理（Action とローカルの CLI の両方から使う）。

import { chunkCells, type Calendar } from "./cells.js";
import { simulate } from "./game/simulate.js";
import { getPalette } from "./render/palette.js";
import { renderSvg } from "./render/svg.js";

/**
 * 盤面の大きさのプリセット。
 * graph は草と同じ大きさ（列 = 草の週数、行 = 7）。
 */
export const BOARDS = ["official", "18x7", "14x7", "graph"] as const;
export type BoardName = (typeof BOARDS)[number];
export const DEFAULT_BOARD: BoardName = "official";

export function boardSize(name: string, calendar: Calendar): { width: number; height: number } {
  switch (name) {
    case "official":
      return { width: 10, height: 20 };
    case "18x7":
      return { width: 18, height: 7 };
    case "14x7":
      return { width: 14, height: 7 };
    case "graph":
      return { width: calendar.weeks, height: 7 };
    default:
      throw new Error(`unknown board: ${name} (available: ${BOARDS.join(", ")})`);
  }
}

export interface OutputSpec {
  path: string;
  palette?: string;
  board?: string;
}

/** snk と同じ書式の出力指定を読む。例: "dist/a.svg?palette=github-dark&board=18x7" */
export function parseOutputs(text: string): OutputSpec[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [path, query = ""] = line.split("?");
      const params = new URLSearchParams(query);
      return {
        path,
        palette: params.get("palette") ?? undefined,
        board: params.get("board") ?? undefined,
      };
    });
}

export interface GenerateOptions {
  palette?: string;
  board?: string;
  scale?: number; // 画像の表示倍率（盤面は変えずに見た目の大きさだけ変える）
}

export function generate(login: string, calendar: Calendar, opts: GenerateOptions = {}): string {
  const last = calendar.days[calendar.days.length - 1]?.date ?? "";
  const { width, height } = boardSize(opts.board ?? DEFAULT_BOARD, calendar);
  const game = simulate({
    width,
    height,
    cells: chunkCells(calendar.days),
    seed: `${login.toLowerCase()}:${last.slice(0, 4)}`,
  });
  return renderSvg(game, getPalette(opts.palette), opts.scale ?? 1);
}
