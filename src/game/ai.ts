// 自動プレイ: 出現位置から到達できる置き場所を幅優先で全部探し、評価式で一番良いものを選ぶ。
// 評価式は Dellacherie 系（El-Tetris の重み）。

import { Board, EMPTY, HIDDEN, type PieceState } from "./board.js";
import { boxSize, cellsOf, kicks, type PieceType, type Rotation } from "./pieces.js";

export type Move = "left" | "right" | "down" | "cw" | "ccw";

export interface Step {
  move: Move;
  state: PieceState;
}

export interface Plan {
  path: Step[]; // 出現位置から固定位置までの操作（出現位置そのものは含まない）
  final: PieceState;
  score: number;
}

export function spawnState(type: PieceType, width: number): PieceState {
  return { x: Math.floor((width - boxSize(type)) / 2), y: HIDDEN - 2, r: 0 };
}

const key = (s: PieceState) => `${s.x},${s.y},${s.r}`;

function neighbors(board: Board, type: PieceType, s: PieceState): Step[] {
  const out: Step[] = [];
  const tryMove = (move: Move, n: PieceState) => {
    if (board.fits(type, n)) out.push({ move, state: n });
  };
  // 幅優先探索では先に試した操作が手順に残りやすい。回転 → 横移動 → 落下の順に並べて、
  // 「上で向きと位置を決めてから落とす」自然な手順になるようにする。
  if (type !== "O") {
    for (const [move, dr] of [["cw", 1], ["ccw", 3]] as const) {
      const to = ((s.r + dr) % 4) as Rotation;
      for (const [kx, ky] of kicks(type, s.r, to)) {
        const n = { x: s.x + kx, y: s.y + ky, r: to };
        if (board.fits(type, n)) {
          out.push({ move, state: n });
          break;
        }
      }
    }
  }
  tryMove("left", { ...s, x: s.x - 1 });
  tryMove("right", { ...s, x: s.x + 1 });
  tryMove("down", { ...s, y: s.y + 1 });
  return out;
}

const W = {
  landingHeight: -4.500158825082766,
  eroded: 3.4181268101392694,
  rowTransitions: -3.2178882868487753,
  colTransitions: -9.348695305445199,
  holes: -7.899265427351652,
  wells: -3.3855972247263626,
};

export function evaluate(board: Board, type: PieceType, s: PieceState): number {
  const b = board.clone();
  const cells = cellsOf(type, s.r).map(([cx, cy]) => [s.x + cx, s.y + cy] as const);
  const ids = cells.map((_, i) => -2 - i); // 評価用の仮の ID（-2 以下）
  const { topOut } = b.lock(type, s, ids);
  if (topOut) return -1e9;

  const landingHeight = b.rows - cells.reduce((sum, [, y]) => sum + y, 0) / cells.length;
  const { rows: clearedRows, cleared } = b.clearLines();
  const eroded = clearedRows.length * cleared.filter((id) => id <= -2).length;

  const filled = (x: number, y: number) =>
    x < 0 || x >= b.width || y >= b.rows ? true : y < 0 ? false : b.grid[y][x] !== EMPTY;

  let rowTransitions = 0;
  for (let y = 0; y < b.rows; y++) {
    for (let x = -1; x < b.width; x++) if (filled(x, y) !== filled(x + 1, y)) rowTransitions++;
  }

  let colTransitions = 0;
  let holes = 0;
  for (let x = 0; x < b.width; x++) {
    let seenBlock = false;
    for (let y = 0; y < b.rows; y++) {
      const f = filled(x, y);
      if (f !== filled(x, y + 1)) colTransitions++;
      if (f) seenBlock = true;
      else if (seenBlock) holes++;
    }
  }

  let wells = 0;
  for (let x = 0; x < b.width; x++) {
    let depth = 0;
    for (let y = 0; y < b.rows; y++) {
      if (!filled(x, y) && filled(x - 1, y) && filled(x + 1, y)) {
        depth++;
        wells += depth;
      } else if (filled(x, y)) {
        depth = 0;
      }
    }
  }

  return (
    W.landingHeight * landingHeight +
    W.eroded * eroded +
    W.rowTransitions * rowTransitions +
    W.colTransitions * colTransitions +
    W.holes * holes +
    W.wells * wells
  );
}

/**
 * 最良の置き場所と、そこまでの操作手順を返す。出現できなければ null。
 *
 * 出現位置は見えない領域にあるので、そこから横に動くと画面の外で移動が終わってしまう。
 * そこで、まず真ん中のまま見える領域の最上段まで落とし、そこから探索する。
 * そこまで落とせないとき（真ん中が積み上がっているとき）だけ、出現位置から探索する。
 */
export function plan(board: Board, type: PieceType): Plan | null {
  const spawn = spawnState(type, board.width);
  if (!board.fits(type, spawn)) return null;

  const top = Math.min(...cellsOf(type, 0).map(([, y]) => y));
  const entryY = HIDDEN - top;
  const prefix: Step[] = [];
  for (let y = spawn.y + 1; y <= entryY; y++) {
    const s = { ...spawn, y };
    if (!board.fits(type, s)) {
      prefix.length = 0;
      break;
    }
    prefix.push({ move: "down", state: s });
  }
  const start = prefix.length > 0 ? prefix[prefix.length - 1].state : spawn;
  const result = search(board, type, start);
  if (!result) return null;
  return { ...result, path: [...prefix, ...result.path] };
}

function search(board: Board, type: PieceType, start: PieceState): Plan | null {
  const prev = new Map<string, { from: string; step: Step } | null>();
  const states = new Map<string, PieceState>();
  prev.set(key(start), null);
  states.set(key(start), start);
  const queue: PieceState[] = [start];
  const locks: PieceState[] = [];

  while (queue.length > 0) {
    const s = queue.shift()!;
    if (!board.fits(type, { ...s, y: s.y + 1 })) locks.push(s);
    for (const step of neighbors(board, type, s)) {
      const k = key(step.state);
      if (prev.has(k)) continue;
      prev.set(k, { from: key(s), step });
      states.set(k, step.state);
      queue.push(step.state);
    }
  }

  let best: { s: PieceState; score: number } | null = null;
  for (const s of locks) {
    const score = evaluate(board, type, s);
    if (!best || score > best.score) best = { s, score };
  }
  if (!best) return null;

  const path: Step[] = [];
  let k = key(best.s);
  for (let p = prev.get(k); p; p = prev.get(k)) {
    path.unshift(p.step);
    k = p.from;
  }
  return { path, final: best.s, score: best.score };
}
