// スタイル別の評価（quad / tspin）。classic は ai.ts の evaluate をそのまま使う。
//
// 評価 = 置いた瞬間の得点（reward）＋置いたあとの盤面の良さ（value）。
// 先読みでは reward を足し合わせ、value は最後の盤面のものだけを使う。

import { detectSpin, type Spin } from "./spin.js";
import { Board, EMPTY } from "./board.js";
import type { Step } from "./ai.js";
import { cellsOf, type PieceType } from "./pieces.js";
import type { PieceState } from "./board.js";

export type Style = "classic" | "quad" | "tspin";
export const STYLES: Style[] = ["classic", "quad", "tspin"];

export interface Outcome {
  board: Board; // 置いて行を消したあとの盤面
  lines: number;
  spin: Spin;
  allClear: boolean;
  topOut: boolean;
}

/** 盤面に置いて行を消した結果。board は書き換えない。 */
export function apply(board: Board, type: PieceType, s: PieceState, last: Step | undefined): Outcome {
  const spin = detectSpin(board, type, s, last);
  const b = board.clone();
  const { topOut } = b.lock(type, s, [-2, -3, -4, -5]);
  const { rows } = b.clearLines();
  return { board: b, lines: rows.length, spin, allClear: rows.length > 0 && b.allIds().length === 0, topOut };
}

export function reward(style: Style, o: Outcome): number {
  if (o.topOut) return -1e9;
  let r = o.allClear ? 30 : 0;
  if (style === "quad") {
    if (o.lines === 4) r += 80;
    else r -= 8 * o.lines;
  } else if (style === "tspin") {
    if (o.spin === "full") r += [4, 25, 80, 110][o.lines] ?? 110;
    else if (o.spin === "mini" && o.lines > 0) r += 6;
    else if (o.lines === 4) r += 10;
    else r -= 5 * o.lines;
  }
  return r;
}

/** 井戸にする列（真ん中）。 */
export function wellColumn(width: number): number {
  return Math.floor((width - 1) / 2);
}

interface Shape {
  heights: number[];
  holes: number;
  maxHeight: number;
  aggregate: number;
}

function shape(b: Board): Shape {
  const heights: number[] = [];
  let holes = 0;
  for (let x = 0; x < b.width; x++) {
    let h = 0;
    for (let y = 0; y < b.rows; y++) {
      if (b.grid[y][x] !== EMPTY) {
        if (h === 0) h = b.rows - y;
      } else if (h > 0) {
        holes++;
      }
    }
    heights.push(h);
  }
  return {
    heights,
    holes,
    maxHeight: Math.max(...heights),
    aggregate: heights.reduce((a, c) => a + c, 0),
  };
}

function overflow(b: Board, maxHeight: number, ratio: number): number {
  return Math.max(0, maxHeight - b.height * ratio);
}

export function value(style: Style, b: Board): number {
  const sh = shape(b);
  if (style === "quad") return quadValue(b, sh);
  return tspinValue(b, sh);
}

function quadValue(b: Board, sh: Shape): number {
  const well = wellColumn(b.width);
  let wellBlocks = 0;
  for (let y = 0; y < b.rows; y++) if (b.grid[y][well] !== EMPTY) wellBlocks++;

  let bump = 0;
  for (let x = 0; x + 1 < b.width; x++) {
    if (x === well || x + 1 === well) continue;
    bump += Math.abs(sh.heights[x] - sh.heights[x + 1]);
  }
  // 井戸をはさんだ左右の段差も見る
  if (well > 0 && well + 1 < b.width) bump += Math.abs(sh.heights[well - 1] - sh.heights[well + 1]);

  let ready = 0;
  for (let y = 0; y < b.rows; y++) {
    const row = b.grid[y];
    if (row[well] === EMPTY && row.every((v, x) => x === well || v !== EMPTY)) ready++;
  }

  // 井戸以外にできた深い溝（I 待ちが増えるので嫌う）
  let sideWells = 0;
  for (let x = 0; x < b.width; x++) {
    if (x === well) continue;
    const left = x === 0 ? Infinity : sh.heights[x - 1];
    const right = x === b.width - 1 ? Infinity : sh.heights[x + 1];
    if (Math.min(left, right) - sh.heights[x] >= 3) sideWells++;
  }

  return (
    -8 * sh.holes -
    12 * wellBlocks -
    1.5 * bump -
    0.25 * sh.aggregate -
    4 * sideWells +
    3 * Math.min(ready, 4) -
    6 * overflow(b, sh.maxHeight, 0.45)
  );
}

function tspinValue(b: Board, sh: Shape): number {
  let bump = 0;
  for (let x = 0; x + 1 < b.width; x++) bump += Math.abs(sh.heights[x] - sh.heights[x + 1]);
  const slot = findTSlot(b);
  return (
    -7 * (sh.holes - slot.holes) -
    1.2 * bump -
    0.25 * sh.aggregate -
    6 * overflow(b, sh.maxHeight, 0.5) +
    slot.bonus
  );
}

/**
 * T スピンダブルの穴（T を下向きに回し入れる形）を探す。
 * 見つかれば、そろう行数に応じた加点と、その穴のぶん「穴」の減点を打ち消す数を返す。
 * 入れられるかは、T の真上と、空いている上の角の上が空っぽかどうかで近似する。
 */
export function findTSlot(b: Board): { bonus: number; holes: number } {
  const filled = (x: number, y: number) => b.filled(x, y);
  const emptyAbove = (x: number, y: number) => {
    for (let yy = y; yy >= 0; yy--) if (filled(x, yy)) return false;
    return true;
  };
  let best = { bonus: 0, holes: 0 };
  for (let by = 0; by + 2 < b.rows; by++) {
    for (let bx = 0; bx + 2 < b.width; bx++) {
      const cells = cellsOf("T", 2).map(([cx, cy]) => [bx + cx, by + cy] as const);
      if (cells.some(([x, y]) => filled(x, y))) continue;
      if (!filled(bx + 1, by + 3)) continue; // 下が支えになっていない
      if (!filled(bx, by + 2) || !filled(bx + 2, by + 2)) continue; // 下の2隅
      const tl = filled(bx, by);
      const tr = filled(bx + 2, by);
      if (tl === tr) continue; // 上の角はちょうど片方だけ埋まっている（ひさし）
      const open = tl ? bx + 2 : bx;
      if (!emptyAbove(bx + 1, by) || !emptyAbove(open, by)) continue;

      let lines = 0;
      const rowFull = (y: number, except: number[]) =>
        b.grid[y].every((v, x) => except.includes(x) || v !== EMPTY);
      if (rowFull(by + 1, [bx, bx + 1, bx + 2])) lines++;
      if (rowFull(by + 2, [bx + 1])) lines++;
      const bonus = [3, 12, 35][lines];
      if (bonus > best.bonus) {
        // ひさしの下に隠れていて「穴」と数えられたマスの数
        let hidden = 0;
        for (const [x, y] of cells) {
          for (let yy = y - 1; yy >= 0; yy--) {
            if (filled(x, yy)) {
              hidden++;
              break;
            }
          }
        }
        best = { bonus, holes: hidden };
      }
    }
  }
  return best;
}
