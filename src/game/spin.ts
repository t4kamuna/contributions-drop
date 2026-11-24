// T スピンの判定（ガイドラインの3コーナールール）。
//
// - 最後に成功した操作が回転で、T の中心から見て斜め四隅のうち3つ以上が埋まっていれば T スピン。
//   壁と床は埋まっている扱い。
// - 向いている側の2隅が両方埋まっていれば通常の T スピン、そうでなければ mini。
//   ただし回転補正の5番目（最後）の候補で入った場合は通常扱い。

import type { Step } from "./ai.js";
import type { Board, PieceState } from "./board.js";
import type { PieceType } from "./pieces.js";

export type Spin = "none" | "mini" | "full";

// 3x3 の箱の中での四隅。T の中心は (1,1)。
const CORNERS = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
] as const;

// 向きごとの「向いている側」の2隅（CORNERS の添字）。0=上 1=右 2=下 3=左。
const FRONT: Record<number, [number, number]> = {
  0: [0, 1],
  1: [1, 2],
  2: [2, 3],
  3: [3, 0],
};

/** board は固定する前の盤面。last は固定位置に入った最後の操作。 */
export function detectSpin(board: Board, type: PieceType, s: PieceState, last: Step | undefined): Spin {
  if (type !== "T" || !last || (last.move !== "cw" && last.move !== "ccw")) return "none";
  const filled = CORNERS.map(([cx, cy]) => board.filled(s.x + cx, s.y + cy));
  if (filled.filter(Boolean).length < 3) return "none";
  const [a, b] = FRONT[s.r];
  if (filled[a] && filled[b]) return "full";
  return last.kick === 4 ? "full" : "mini";
}

/** 見せ場の文字。普通の 1〜3 段消しでは出さない。 */
export function clearLabel(spin: Spin, lines: number): string | null {
  const names = ["", " SINGLE", " DOUBLE", " TRIPLE"];
  if (spin === "full") return `T-SPIN${names[lines] ?? ""}`;
  if (spin === "mini" && lines > 0) return "T-SPIN MINI";
  if (lines >= 4) return "4 LINES";
  return null;
}
