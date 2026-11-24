// ローカルでのプレビュー用。
//   GITHUB_TOKEN=... npx tsx src/cli.ts --user <name> --out preview.svg [--palette github-dark]
//   npx tsx src/cli.ts --fake 0.6 --out preview.svg   （API を使わず架空の草で。数字は草のある日の割合）
//   --board official|18x7|14x7|graph で盤面の大きさを選ぶ（省略時は official = 10x20）
//   --style classic|quad|tspin でプレイスタイルを選ぶ（quad・tspin は official の盤面のみ）

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { Calendar } from "./cells.js";
import { fakeCalendar } from "./fake.js";
import { fetchCalendar } from "./github.js";
import { generate } from "./generate.js";

const { values } = parseArgs({
  options: {
    user: { type: "string" },
    fake: { type: "string" },
    out: { type: "string", default: "preview.svg" },
    palette: { type: "string" },
    board: { type: "string" },
    style: { type: "string" },
    scale: { type: "string" },
  },
});

async function main() {
  let calendar: Calendar;
  const login = values.user ?? "fake";
  if (values.fake) {
    calendar = fakeCalendar({ density: Number(values.fake) });
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!values.user || !token) throw new Error("--user and GITHUB_TOKEN are required (or use --fake)");
    calendar = await fetchCalendar(values.user, token);
  }
  const svg = generate(login, calendar, {
    palette: values.palette,
    board: values.board,
    style: values.style,
    onWarning: (m) => console.warn(`warning: ${m}`),
    scale: values.scale ? Number(values.scale) : undefined,
  });
  await mkdir(dirname(values.out!), { recursive: true });
  await writeFile(values.out!, svg);
  console.log(`wrote ${values.out} (${svg.length} bytes)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
