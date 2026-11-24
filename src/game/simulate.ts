// 1ゲームを最後まで回し、描画に必要な出来事の列を返す。時間の割り当ては描画側でやる。

import type { Level } from "../cells.js";
import { evaluate, placements, plan, spawnState, type Placement, type Step } from "./ai.js";
import { bagSequence, createRandom, hashSeed } from "./bag.js";
import { Board, HIDDEN, type PieceState } from "./board.js";
import { cellsOf, type PieceType } from "./pieces.js";
import { clearLabel, detectSpin, type Spin } from "./spin.js";
import { apply, reward, value, type Style } from "./styles.js";

/** ミノ1個ぶんの中身（形と、割り当てられた草）。 */
export interface PieceDef {
  index: number;
  type: PieceType;
  ids: number[]; // spawnCells の並び順に対応するブロック ID
  levels: Level[]; // 各ブロックの草の濃さ
}

/** ミノを1個置くまでの出来事。 */
export interface PieceEvent extends PieceDef {
  spawn: PieceState;
  path: Step[];
  final: PieceState;
  /** この番でホールドにしまったミノ（出現してすぐしまう）とその見せる位置 */
  stash?: { index: number; at: PieceState };
  /** 置いたミノがホールドから出てきたか */
  fromHold?: boolean;
  spin?: Spin;
  /** 見せ場の文字（4 LINES、T-SPIN DOUBLE、ALL CLEAR など） */
  labels?: string[];
  /** 固定のあとに起きたこと */
  after:
    | { kind: "none" }
    | { kind: "clear"; rows: number[]; cleared: number[]; shifts: { id: number; dy: number }[] }
    | { kind: "topOut"; cleared: number[] };
}

export interface Game {
  width: number;
  height: number;
  style: Style;
  defs: PieceDef[];
  pieces: PieceEvent[];
}

export function simulate(opts: {
  width: number;
  height: number;
  cells: Level[][];
  seed: string;
  style?: Style;
}): Game {
  const style = opts.style ?? "classic";
  const types = bagSequence(opts.cells.length, createRandom(hashSeed(opts.seed)));
  let nextId = 0;
  const defs: PieceDef[] = types.map((type, index) => ({
    index,
    type,
    ids: [nextId++, nextId++, nextId++, nextId++],
    levels: opts.cells[index],
  }));
  const game: Game = { width: opts.width, height: opts.height, style, defs, pieces: [] };
  if (style === "classic") playClassic(game);
  else playStyled(game, style);
  return game;
}

function playClassic(game: Game): void {
  const board = new Board(game.width, game.height);
  for (const def of game.defs) {
    // 見えない領域にブロックが残ることはない（残ったら下で盤面を空にする）ので、出現は必ずできる。
    const p = plan(board, def.type);
    if (!p) throw new Error(`piece ${def.index} cannot spawn`);
    game.pieces.push(place(board, game, def, p, {}));
  }
}

/** 盤面に置いて、行の消去とゲームオーバーの処理をし、出来事を作る。 */
function place(
  board: Board,
  game: Game,
  def: PieceDef,
  p: Placement,
  extra: { stash?: PieceEvent["stash"]; fromHold?: boolean; labels?: boolean },
): PieceEvent {
  const spin = extra.labels ? detectSpin(board, def.type, p.final, p.path[p.path.length - 1]) : undefined;
  board.lock(def.type, p.final, def.ids);
  const event: PieceEvent = {
    ...def,
    spawn: spawnState(def.type, game.width),
    path: p.path,
    final: p.final,
    after: { kind: "none" },
  };
  if (extra.stash) event.stash = extra.stash;
  if (extra.fromHold) event.fromHold = true;

  // 見えない領域にはみ出して固定された場合はゲームオーバー扱いで盤面を空にする。
  const lines = board.clearLines();
  if (lines.rows.length > 0) {
    event.after = { kind: "clear", ...lines };
  }
  if (extra.labels) {
    event.spin = spin;
    const labels: string[] = [];
    const main = clearLabel(spin ?? "none", lines.rows.length);
    if (main) labels.push(main);
    if (lines.rows.length > 0 && board.allIds().length === 0) labels.push("ALL CLEAR");
    if (labels.length > 0) event.labels = labels;
  }
  if (cellsAbove(board)) {
    const cleared = board.allIds();
    board.reset();
    const prevCleared = event.after.kind === "clear" ? event.after.cleared : [];
    event.after = { kind: "topOut", cleared: [...prevCleared, ...cleared] };
  }
  return event;
}

// tspin は T の穴を作る手を残すため、少し広めに探す
const BEAM: Record<Style, number> = { classic: 1, quad: 8, tspin: 12 };

interface Candidate {
  option: "none" | "stash" | "swap";
  def: PieceDef;
  placement: Placement;
  first: number; // 1手目の reward + value
  reward: number;
  after: Board;
  next?: PieceType; // 先読みする次のミノ
  held?: PieceType; // 次の番にホールドから出せるミノ
}

function playStyled(game: Game, style: Style): void {
  const board = new Board(game.width, game.height);
  const queue = [...game.defs];
  let hold: PieceDef | null = null;

  while (queue.length > 0 || hold) {
    const current = queue.shift() ?? null;
    const options: { option: Candidate["option"]; def: PieceDef; next?: PieceType; held?: PieceType }[] = [];
    if (current) {
      options.push({ option: "none", def: current, next: queue[0]?.type ?? hold?.type, held: hold?.type });
      if (!hold && queue.length > 0) options.push({ option: "stash", def: queue[0], next: queue[1]?.type ?? current.type, held: current.type });
      if (hold) options.push({ option: "swap", def: hold, next: queue[0]?.type ?? current.type, held: current.type });
    } else {
      // 草を全部出し終えた。ホールドに残ったミノを出して置く。
      options.push({ option: "swap", def: hold! });
    }

    const danger = Math.max(...heightsOf(board)) > board.height * 0.6;
    const candidates: Candidate[] = [];
    for (const o of options) {
      const list = placements(board, o.def.type, style === "tspin" && o.def.type === "T");
      if (!list) continue;
      for (const p of list) {
        if (danger) {
          const score = evaluate(board, o.def.type, p.final);
          candidates.push({ ...o, placement: p, first: score, reward: 0, after: board });
          continue;
        }
        const out = apply(board, o.def.type, p.final, p.path[p.path.length - 1]);
        const r = reward(style, out);
        candidates.push({ ...o, placement: p, first: r + (out.topOut ? 0 : value(style, out.board)), reward: r, after: out.board });
      }
    }
    if (candidates.length === 0) throw new Error("no piece can spawn");

    let chosen = candidates[0];
    if (danger) {
      for (const c of candidates) if (c.first > chosen.first) chosen = c;
    } else {
      const beam = [...candidates].sort((a, b) => b.first - a.first).slice(0, BEAM[style]);
      let best = -Infinity;
      for (const c of beam) {
        const total = c.reward > -1e8 && c.next ? c.reward + Math.max(lookahead(style, c.after, c.next), style === "tspin" && c.held && c.held !== c.next ? lookahead(style, c.after, c.held) : -Infinity) : c.first;
        if (total > best) {
          best = total;
          chosen = c;
        }
      }
    }

    // 選んだ手に合わせて列とホールドを進める
    let stash: PieceEvent["stash"];
    let fromHold = false;
    if (chosen.option === "stash") {
      stash = { index: current!.index, at: entryState(board, current!.type) };
      hold = current;
      queue.shift();
    } else if (chosen.option === "swap") {
      fromHold = true;
      if (current) {
        stash = { index: current.index, at: entryState(board, current.type) };
      }
      hold = current;
    }
    game.pieces.push(place(board, game, chosen.def, chosen.placement, { stash, fromHold, labels: true }));
  }
}

function lookahead(style: Style, board: Board, type: PieceType): number {
  const list = placements(board, type, style === "tspin" && type === "T");
  if (!list) return -1e9;
  let best = -Infinity;
  for (const p of list) {
    const out = apply(board, type, p.final, p.path[p.path.length - 1]);
    const r = reward(style, out);
    const total = out.topOut ? r : r + value(style, out.board);
    if (total > best) best = total;
  }
  return best;
}

/** ホールドにしまうミノを一瞬見せる位置（真ん中の最上段）。 */
function entryState(board: Board, type: PieceType): PieceState {
  const spawn = spawnState(type, board.width);
  const top = Math.min(...cellsOf(type, 0).map(([, y]) => y));
  const entry = { ...spawn, y: HIDDEN - top };
  return board.fits(type, entry) ? entry : spawn;
}

function heightsOf(board: Board): number[] {
  return Array.from({ length: board.width }, (_, x) => {
    for (let y = 0; y < board.rows; y++) if (board.grid[y][x] >= 0) return board.rows - y;
    return 0;
  });
}

function cellsAbove(board: Board): boolean {
  const hidden = board.rows - board.height;
  return board.grid.slice(0, hidden).some((row) => row.some((v) => v >= 0));
}
