import { describe, expect, it } from "vitest";
import { plan } from "../src/game/ai.js";
import { bagSequence, createRandom } from "../src/game/bag.js";
import { Board, EMPTY, HIDDEN } from "../src/game/board.js";
import { cellsOf, kicks, PIECE_TYPES } from "../src/game/pieces.js";
import { simulate } from "../src/game/simulate.js";
import { chunkCells } from "../src/cells.js";
import { fakeCalendar } from "../src/fake.js";
import { BOARDS, DEFAULT_BOARD, boardSize, parseOutputs } from "../src/generate.js";

describe("pieces", () => {
  it("every piece has 4 cells in every rotation", () => {
    for (const t of PIECE_TYPES) for (const r of [0, 1, 2, 3] as const) expect(cellsOf(t, r)).toHaveLength(4);
  });

  it("T rotates clockwise like SRS", () => {
    const sorted = (c: readonly (readonly [number, number])[]) => [...c].map((p) => p.join(",")).sort();
    expect(sorted(cellsOf("T", 1))).toEqual(sorted([[1, 0], [1, 1], [2, 1], [1, 2]]));
    expect(sorted(cellsOf("I", 1))).toEqual(sorted([[2, 0], [2, 1], [2, 2], [2, 3]]));
  });

  it("kick tables have 5 tests and start with no offset", () => {
    for (const t of ["T", "I"] as const) {
      const k = kicks(t, 0, 1);
      expect(k).toHaveLength(5);
      expect(k[0]).toEqual([0, 0]);
    }
  });
});

describe("7-bag", () => {
  it("every group of 7 contains each piece once", () => {
    const seq = bagSequence(70, createRandom(42));
    for (let i = 0; i < 70; i += 7) expect(new Set(seq.slice(i, i + 7)).size).toBe(7);
  });

  it("is deterministic for the same seed", () => {
    expect(bagSequence(21, createRandom(1))).toEqual(bagSequence(21, createRandom(1)));
  });
});

describe("board", () => {
  it("clears full rows and shifts the rest down", () => {
    const b = new Board(4, 3);
    const bottom = b.rows - 1;
    b.grid[bottom] = [0, 1, 2, 3];
    b.grid[bottom - 1] = [4, EMPTY, EMPTY, EMPTY];
    const res = b.clearLines();
    expect(res.rows).toEqual([bottom]);
    expect(res.cleared).toEqual([0, 1, 2, 3]);
    expect(res.shifts).toEqual([{ id: 4, dy: 1 }]);
    expect(b.grid[bottom][0]).toBe(4);
  });
});

describe("ai", () => {
  it("drops an I piece flat on the floor of an empty board", () => {
    const b = new Board(10, 7);
    const p = plan(b, "I")!;
    const ys = cellsOf("I", p.final.r).map(([, y]) => p.final.y + y);
    expect(Math.min(...ys)).toBe(b.rows - 1);
    expect(p.path.at(-1)!.state).toEqual(p.final);
  });
});

describe("simulate", () => {
  for (const density of [0.2, 0.6, 1]) {
    it(`places every cell exactly once (density ${density})`, () => {
      const cal = fakeCalendar({ density });
      const cells = chunkCells(cal.days);
      const game = simulate({ width: cal.weeks, height: 7, cells, seed: "test" });
      expect(game.pieces).toHaveLength(cells.length);
      const ids = game.pieces.flatMap((p) => p.ids);
      expect(new Set(ids).size).toBe(cells.length * 4);
      for (const p of game.pieces) {
        for (const [, y] of cellsOf(p.type, p.final.r)) expect(p.final.y + y).toBeGreaterThanOrEqual(0);
      }
      const topOuts = game.pieces.filter((p) => p.after.kind === "topOut").length;
      expect(topOuts).toBe(0);
    });
  }

  it("hidden rows stay above the visible board", () => {
    expect(HIDDEN).toBeGreaterThanOrEqual(4);
  });
});

describe("boards", () => {
  const cal = fakeCalendar({ density: 1 });
  for (const name of BOARDS) {
    it(`${name}: plays a full year without topping out`, () => {
      const { width, height } = boardSize(name, cal);
      const game = simulate({ width, height, cells: chunkCells(cal.days), seed: "board" });
      expect(game.pieces.filter((p) => p.after.kind === "topOut")).toHaveLength(0);
    });
  }

  it("defaults to the official size and reads board from outputs", () => {
    expect(DEFAULT_BOARD).toBe("official");
    expect(boardSize("official", cal)).toEqual({ width: 10, height: 20 });
    expect(boardSize("graph", cal)).toEqual({ width: cal.weeks, height: 7 });
    expect(parseOutputs("a.svg?palette=github-dark&board=18x7\nb.svg")).toEqual([
      { path: "a.svg", palette: "github-dark", board: "18x7" },
      { path: "b.svg", palette: undefined, board: undefined },
    ]);
    expect(() => boardSize("99x99", cal)).toThrow();
  });
});

describe("cells", () => {
  it("groups active days by 4 and pads the last group with level 0", () => {
    const days = [1, 2, 0, 3, 4, 1].map((level, i) => ({
      date: `2026-01-0${i + 1}`,
      count: level,
      level: level as 0 | 1 | 2 | 3 | 4,
    }));
    expect(chunkCells(days)).toEqual([
      [1, 2, 3, 4],
      [1, 0, 0, 0],
    ]);
  });
});
