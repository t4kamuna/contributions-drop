// 1ゲームを最後まで回し、描画に必要な出来事の列を返す。時間の割り当ては描画側でやる。

import type { Level } from "../cells.js";
import { plan, spawnState, type Step } from "./ai.js";
import { bagSequence, createRandom, hashSeed } from "./bag.js";
import { Board, type PieceState } from "./board.js";
import type { PieceType } from "./pieces.js";

export interface PieceEvent {
  index: number;
  type: PieceType;
  ids: number[]; // spawnCells の並び順に対応するブロック ID
  levels: Level[]; // 各ブロックの草の濃さ
  spawn: PieceState;
  path: Step[];
  final: PieceState;
  /** 固定のあとに起きたこと */
  after:
    | { kind: "none" }
    | { kind: "clear"; rows: number[]; cleared: number[]; shifts: { id: number; dy: number }[] }
    | { kind: "topOut"; cleared: number[] };
}

export interface Game {
  width: number;
  height: number;
  pieces: PieceEvent[];
}

export function simulate(opts: {
  width: number;
  height: number;
  cells: Level[][];
  seed: string;
}): Game {
  const board = new Board(opts.width, opts.height);
  const types = bagSequence(opts.cells.length, createRandom(hashSeed(opts.seed)));
  const pieces: PieceEvent[] = [];
  let nextId = 0;

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    const ids = [nextId++, nextId++, nextId++, nextId++];

    // 見えない領域にブロックが残ることはない（残ったら下で盤面を空にする）ので、出現は必ずできる。
    const p = plan(board, type);
    if (!p) throw new Error(`piece ${i} cannot spawn`);

    board.lock(type, p.final, ids);
    const event: PieceEvent = {
      index: i,
      type,
      ids,
      levels: opts.cells[i],
      spawn: spawnState(type, opts.width),
      path: p.path,
      final: p.final,
      after: { kind: "none" },
    };

    // 見えない領域にはみ出して固定された場合はゲームオーバー扱いで盤面を空にする。
    const lines = board.clearLines();
    if (lines.rows.length > 0) {
      event.after = { kind: "clear", ...lines };
    }
    if (cellsAbove(board)) {
      const cleared = board.allIds();
      board.reset();
      const prevCleared = event.after.kind === "clear" ? event.after.cleared : [];
      event.after = { kind: "topOut", cleared: [...prevCleared, ...cleared] };
    }
    pieces.push(event);
  }

  return { width: opts.width, height: opts.height, pieces };
}

function cellsAbove(board: Board): boolean {
  const hidden = board.rows - board.height;
  return board.grid.slice(0, hidden).some((row) => row.some((v) => v >= 0));
}
