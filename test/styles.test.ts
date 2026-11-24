import { describe, expect, it } from "vitest";
import { placements } from "../src/game/ai.js";
import { Board } from "../src/game/board.js";
import { clearLabel, detectSpin } from "../src/game/spin.js";
import { apply } from "../src/game/styles.js";
import { simulate } from "../src/game/simulate.js";
import { chunkCells } from "../src/cells.js";
import { fakeCalendar } from "../src/fake.js";
import { BOARDS, boardSize, generate, resolveStyle } from "../src/generate.js";

function fill(b: Board, cells: [number, number][]) {
  for (const [x, y] of cells) b.grid[y][x] = 0;
}

/** 下2段に T スピンダブルの穴、左上にひさしがある盤面。 */
function tsdBoard(): Board {
  const b = new Board(10, 20);
  const bottom = b.rows - 1;
  for (let x = 0; x < 10; x++) {
    if (x !== 4) fill(b, [[x, bottom]]);
    if (x < 3 || x > 5) fill(b, [[x, bottom - 1]]);
  }
  fill(b, [[0, bottom - 2], [1, bottom - 2], [2, bottom - 2], [3, bottom - 2]]); // ひさし
  return b;
}

describe("T-spin detection", () => {
  it("finds a T-spin double by rotating into the slot", () => {
    const b = tsdBoard();
    const list = placements(b, "T", true)!;
    const slot = list.find((p) => p.final.x === 3 && p.final.y === b.rows - 3 && p.final.r === 2);
    expect(slot).toBeDefined();
    const last = slot!.path[slot!.path.length - 1];
    expect(["cw", "ccw"]).toContain(last.move);
    expect(detectSpin(b, "T", slot!.final, last)).toBe("full");
    const out = apply(b, "T", slot!.final, last);
    expect(out.lines).toBe(2);
    expect(clearLabel(out.spin, out.lines)).toBe("T-SPIN DOUBLE");
  });

  it("needs the last move to be a rotation", () => {
    const b = tsdBoard();
    const s = { x: 3, y: b.rows - 3, r: 2 as const };
    expect(detectSpin(b, "T", s, { move: "down", state: s })).toBe("none");
    expect(detectSpin(b, "L", s, { move: "cw", state: s, kick: 0 })).toBe("none");
  });

  it("is a mini when a front corner is open, unless the last kick was used", () => {
    const b = new Board(10, 20);
    const s = { x: 3, y: 10, r: 0 as const }; // 上向き。前の隅は (3,10) と (5,10)
    fill(b, [[3, 10], [3, 12], [5, 12]]);
    expect(detectSpin(b, "T", s, { move: "cw", state: s, kick: 1 })).toBe("mini");
    expect(detectSpin(b, "T", s, { move: "cw", state: s, kick: 4 })).toBe("full");
  });

  it("labels", () => {
    expect(clearLabel("none", 4)).toBe("4 LINES");
    expect(clearLabel("none", 2)).toBeNull();
    expect(clearLabel("mini", 1)).toBe("T-SPIN MINI");
    expect(clearLabel("mini", 0)).toBeNull();
    expect(clearLabel("full", 3)).toBe("T-SPIN TRIPLE");
  });
});

describe("styled games", () => {
  for (const style of ["quad", "tspin"] as const) {
    for (const density of [0.3, 1]) {
      it(`${style} density=${density}: every block falls exactly once, hold rules hold`, () => {
        const cells = chunkCells(fakeCalendar({ density }).days);
        const g = simulate({ width: 10, height: 20, cells, seed: "test", style });
        // 全ミノがちょうど1回ずつ置かれる（ホールドに残ったミノも最後に置かれる）
        expect(g.pieces.map((p) => p.index).sort((a, b) => a - b)).toEqual(g.defs.map((d) => d.index));
        expect(new Set(g.pieces.flatMap((p) => p.ids)).size).toBe(cells.length * 4);
        expect(g.pieces.filter((p) => p.after.kind === "topOut")).toHaveLength(0);
        // しまったミノは、そのあと必ずホールドから出てくる
        for (const p of g.pieces) {
          if (!p.stash) continue;
          const later = g.pieces.find((q) => q.index === p.stash!.index);
          expect(later?.fromHold).toBe(true);
        }
      });
    }
  }

  it("quad makes 4-line clears and tspin makes T-spin doubles", () => {
    const cells = chunkCells(fakeCalendar({ density: 1 }).days);
    const labels = (style: "quad" | "tspin") =>
      simulate({ width: 10, height: 20, cells, seed: "test", style }).pieces.flatMap((p) => p.labels ?? []);
    expect(labels("quad").filter((l) => l === "4 LINES").length).toBeGreaterThan(0);
    expect(labels("tspin").filter((l) => l === "T-SPIN DOUBLE" || l === "T-SPIN TRIPLE").length).toBeGreaterThan(0);
  });

  it("classic has no hold and no labels", () => {
    const g = simulate({ width: 10, height: 20, cells: chunkCells(fakeCalendar({ density: 1 }).days), seed: "t" });
    expect(g.pieces.some((p) => p.stash || p.fromHold || p.labels)).toBe(false);
  });
});

describe("style option", () => {
  const cal = fakeCalendar({ density: 0.6 });

  it("falls back to classic on 7-row boards with a warning", () => {
    const warnings: string[] = [];
    for (const name of BOARDS) {
      const { height } = boardSize(name, cal);
      const s = resolveStyle("tspin", height, name, (m) => warnings.push(m));
      expect(s).toBe(name === "official" ? "tspin" : "classic");
    }
    expect(warnings).toHaveLength(3);
    expect(() => resolveStyle("nope", 20, "official")).toThrow();
  });

  it("draws the hold box and labels only for quad/tspin", () => {
    expect(generate("x", cal, { style: "classic" })).not.toContain("HOLD");
    const svg = generate("x", cal, { style: "tspin" });
    expect(svg).toContain("HOLD");
    expect(svg).toMatch(/T-SPIN|4 LINES/);
    expect(svg.length).toBeLessThan(1_000_000);
  });
});
