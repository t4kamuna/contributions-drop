// classic の出力が v0.1.0 から1バイトも変わっていないことを確かめる。
// ハッシュは v0.1.0 のコードで作った SVG の sha256 の先頭16文字。

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fakeCalendar } from "../src/fake.js";
import { generate } from "../src/generate.js";

const GOLDEN: [string, number, string, string][] = [
  ["official", 0.3, "github-light", "ce971759cccb4dfa"],
  ["official", 0.3, "github-dark", "07fba0c1c535809d"],
  ["official", 1, "github-light", "1575a332edbd514b"],
  ["official", 1, "github-dark", "972e7561c0c25dd3"],
  ["18x7", 0.3, "github-light", "e5250befb50294c5"],
  ["18x7", 0.3, "github-dark", "8d8f5167408d4ad6"],
  ["18x7", 1, "github-light", "7e82c0c2a495ff3f"],
  ["18x7", 1, "github-dark", "a189240ae61f1c1b"],
  ["14x7", 0.3, "github-light", "aae5b6acb8456b45"],
  ["14x7", 0.3, "github-dark", "6e81cebc16cd52b1"],
  ["14x7", 1, "github-light", "8d042399def276b1"],
  ["14x7", 1, "github-dark", "49879ceaef05bf6b"],
  ["graph", 0.3, "github-light", "b64591d3df0525f4"],
  ["graph", 0.3, "github-dark", "77eac0348f836f67"],
  ["graph", 1, "github-light", "a2be97d4f9db2d30"],
  ["graph", 1, "github-dark", "163ed3895d7a85ba"],
];

describe("classic output is identical to v0.1.0", () => {
  for (const [board, density, palette, hash] of GOLDEN) {
    it(`${board} density=${density} ${palette}`, () => {
      const svg = generate("golden", fakeCalendar({ density }), { board, palette });
      expect(createHash("sha256").update(svg).digest("hex").slice(0, 16)).toBe(hash);
    });
  }
});
