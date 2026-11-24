// 自動プレイ: 出現位置から到達できる置き場所を幅優先で全部探し、評価式で一番良いものを選ぶ。
// 評価式は Dellacherie 系（El-Tetris の重み）。

import { Board, EMPTY, HIDDEN, type PieceState } from "./board.js";
import { boxSize, cellsOf, kicks, type PieceType, type Rotation } from "./pieces.js";

export type Move = "left" | "right" | "down" | "cw" | "ccw";

export interface Step {
  move: Move;
  state: PieceState;
  kick?: number; // 回転のとき、何番目の回転補正で入ったか（0 始まり）
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
      for (const [kick, [kx, ky]] of kicks(type, s.r, to).entries()) {
        const n = { x: s.x + kx, y: s.y + ky, r: to };
        if (board.fits(type, n)) {
          out.push({ move, state: n, kick });
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

export interface Placement {
  path: Step[]; // 出現位置から固定位置までの操作（出現位置そのものは含まない）
  final: PieceState;
}

/**
 * 出現位置から届く固定位置を、幅優先で見つけた順に全部返す。出現できなければ null。
 *
 * 出現位置は見えない領域にあるので、そこから横に動くと画面の外で移動が終わってしまう。
 * そこで、まず真ん中のまま見える領域の最上段まで落とし、そこから探索する。
 * そこまで落とせないとき（真ん中が積み上がっているとき）だけ、出現位置から探索する。
 *
 * spinAware が true のときは「最後の操作が回転だったか」も状態に含めて探す。
 * 同じ位置に落下でも回転でも入れるとき、回転で入る手順（T スピンになりうる）も候補に残すため。
 */
export function placements(board: Board, type: PieceType, spinAware = false): Placement[] | null {
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

  const nodeKey = (s: PieceState, rotated: boolean) => (spinAware && rotated ? `${key(s)},r` : key(s));
  const prev = new Map<string, { from: string; step: Step } | null>();
  const startKey = nodeKey(start, false);
  prev.set(startKey, null);
  const queue: { s: PieceState; k: string }[] = [{ s: start, k: startKey }];
  const locks: string[] = [];

  while (queue.length > 0) {
    const { s, k } = queue.shift()!;
    if (!board.fits(type, { ...s, y: s.y + 1 })) locks.push(k);
    for (const step of neighbors(board, type, s)) {
      const nk = nodeKey(step.state, step.move === "cw" || step.move === "ccw");
      if (prev.has(nk)) continue;
      prev.set(nk, { from: k, step });
      queue.push({ s: step.state, k: nk });
    }
  }

  return locks.map((lockKey) => {
    const path: Step[] = [];
    let k = lockKey;
    for (let p = prev.get(k); p; p = prev.get(k)) {
      path.unshift(p.step);
      k = p.from;
    }
    const final = path.length > 0 ? path[path.length - 1].state : start;
    return { path: [...prefix, ...path], final };
  });
}

/** classic: 評価式で一番良い置き場所を選ぶ（先読み・ホールドなし）。出現できなければ null。 */
export function plan(board: Board, type: PieceType): Plan | null {
  const list = placements(board, type);
  if (!list) return null;
  let best: Plan | null = null;
  for (const p of list) {
    const score = evaluate(board, type, p.final);
    if (!best || score > best.score) best = { ...p, score };
  }
  return best;
}
