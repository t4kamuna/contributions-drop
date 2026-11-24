// GitHub Action の入口。

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as core from "@actions/core";
import { fetchCalendar } from "./github.js";
import { generate, parseOutputs } from "./generate.js";

async function main() {
  const login = core.getInput("github_user_name", { required: true });
  const token = core.getInput("github_token", { required: true });
  const outputs = parseOutputs(core.getInput("outputs", { required: true }));
  const defaultBoard = core.getInput("board") || undefined;
  const defaultStyle = core.getInput("style") || undefined;

  const calendar = await fetchCalendar(login, token);
  for (const out of outputs) {
    const svg = generate(login, calendar, {
      palette: out.palette,
      board: out.board ?? defaultBoard,
      style: out.style ?? defaultStyle,
      onWarning: (m) => core.warning(`${out.path}: ${m}`),
    });
    await mkdir(dirname(out.path), { recursive: true });
    await writeFile(out.path, svg);
    core.info(`wrote ${out.path} (${svg.length} bytes)`);
  }
}

main().catch((err: unknown) => core.setFailed(err instanceof Error ? err.message : String(err)));
