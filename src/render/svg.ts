// 出来事の列を時間に並べ、CSS アニメーション付きの SVG にする。
//
// 1個のミノは <g> 1つ。<g> の transform（平行移動＋箱の中心まわりの回転）で、出現から固定までを動かす。
// 固定後のライン消去（点滅して消える・下に詰まる）は、ブロック1つ1つの <rect> 側で動かす。
// 盤面の上にある見えない出現領域は clipPath で隠す。

import { boxSize, spawnCells } from "../game/pieces.js";
import { spawnState } from "../game/ai.js";
import type { Game } from "../game/simulate.js";
import { HIDDEN, type PieceState } from "../game/board.js";
import type { Palette } from "./palette.js";

const PITCH = 16; // 1マスの間隔(px)
const SIZE = 12; // ブロックの一辺(px)
const OFF = (PITCH - SIZE) / 2;
const MARGIN = 4;

const T = {
  start: 0.4, // 最初のミノが出るまで
  step: 0.009, // 1操作あたり
  minPiece: 0.12, // 1ミノの最短
  maxPiece: 0.45, // 1ミノの最長
  entry: 0.08, // 真ん中の最上段に出てきたところで止める時間
  gap: 0.02, // ミノとミノの間
  flash: 0.24, // ライン消去の点滅
  shift: 0.06, // 上の段が詰まる
  topOut: 0.4, // ゲームオーバー時のフェード
  hold: 1.8, // 最後の盤面を見せる時間
  fade: 0.5, // ループ前のフェード
  blank: 0.3, // 空の盤面
  stashIn: 0.06, // ホールドにしまうミノが最上段に出てくる
  stashShow: 0.08, // そこで止めて見せる
  stashMove: 0.12, // 枠へ移す（枠から戻す）
  labelIn: 0.06, // 見せ場の文字が出る
  labelShow: 0.8, // 見せる
  labelOut: 0.25, // 消える
};

interface Frame {
  t: number;
  css: string;
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();

function groupTransform(s: PieceState, size: number, deg: number, left = 0, scaled = false): string {
  const c = size / 2;
  const x = MARGIN + left + (s.x + c) * PITCH;
  const y = MARGIN + (s.y - HIDDEN + c) * PITCH;
  // ホールドのある盤面では、枠に入るときの縮小と補間がそろうように常に scale を付ける
  return `translate(${num(x)}px,${num(y)}px) rotate(${deg}deg)${scaled ? " scale(1)" : ""}`;
}

// ホールド枠（quad・tspin のときだけ盤面の左に置く）
const HOLD_W = 4 * PITCH + 8;
const HOLD_CSS = `translate(${MARGIN + 2 * PITCH}px,${MARGIN + 1.5 * PITCH}px) rotate(0deg) scale(0.6)`;

/** 回転した <g> の中で、画面の真下に dy マス動かすためのローカルの移動量。 */
function localShift(deg: number, dy: number): [number, number] {
  const rad = (-deg * Math.PI) / 180;
  const wy = dy * PITCH;
  return [Math.round(-Math.sin(rad) * wy), Math.round(Math.cos(rad) * wy)];
}

export function renderSvg(game: Game, palette: Palette, scale = 1): string {
  const styled = game.style !== "classic";
  const left = styled ? HOLD_W : 0;
  const width = left + game.width * PITCH + MARGIN * 2;
  const height = game.height * PITCH + MARGIN * 2;
  const gt = (s: PieceState, size: number, deg: number) => groupTransform(s, size, deg, left, styled);

  const pieceFrames = new Map<number, Frame[]>();
  const pieceDeg = new Map<number, number>();
  const cellFrames = new Map<number, Frame[]>(); // ブロック ID ごと
  const cellOwner = new Map<number, number>(); // ブロック ID → ミノの番号
  const cellShift = new Map<number, number>(); // これまでに下へ詰まったマス数
  const labels: { t: number; text: string; line: number }[] = [];
  const framesOf = (index: number) => {
    let f = pieceFrames.get(index);
    if (!f) pieceFrames.set(index, (f = []));
    return f;
  };

  let t = T.start;
  for (const p of game.pieces) {
    p.ids.forEach((id) => cellOwner.set(id, p.index));
    const size = boxSize(p.type);

    // ホールドにしまうミノ: 真ん中の最上段に一瞬出してから枠へ縮めて移す。
    if (p.stash) {
      const s = game.defs[p.stash.index];
      const sSize = boxSize(s.type);
      const sf = framesOf(s.index);
      sf.push({ t, css: gt(spawnState(s.type, game.width), sSize, 0) });
      sf.push({ t: t + T.stashIn, css: gt(p.stash.at, sSize, 0) });
      sf.push({ t: t + T.stashIn + T.stashShow, css: gt(p.stash.at, sSize, 0) });
      sf.push({ t: t + T.stashIn + T.stashShow + T.stashMove, css: HOLD_CSS });
      t += T.stashIn + T.stashShow + T.stashMove + T.gap;
    }
    // ホールドから出すミノ: 枠から出現位置へ戻してから、いつもどおり動かす。
    if (p.fromHold) {
      framesOf(p.index).push({ t, css: HOLD_CSS });
      t += T.stashMove;
    }

    // 同じ操作が続く間は1本の直線にまとめ、操作が切り替わる点だけ keyframe にする。
    const d = Math.min(T.maxPiece, Math.max(T.minPiece, p.path.length * T.step));
    const dt = p.path.length > 0 ? d / p.path.length : 0;
    // 最初の落下（見えない出現位置から盤面の最上段まで）が終わったら、真ん中で一瞬止めて見せる。
    let deg = 0;
    let pause = 0;
    let entered = false;
    const frames = framesOf(p.index);
    frames.push({ t, css: gt(p.spawn, size, 0) });
    p.path.forEach((step, i) => {
      if (step.move === "cw") deg += 90;
      if (step.move === "ccw") deg -= 90;
      const next = p.path[i + 1];
      if (!next || next.move !== step.move) {
        const time = t + dt * (i + 1) + pause;
        const css = gt(step.state, size, deg);
        frames.push({ t: time, css });
        if (!entered && step.move === "down" && next) {
          pause = T.entry;
          frames.push({ t: time + pause, css });
        }
        entered = true;
      }
    });
    pieceDeg.set(p.index, deg);
    t += d + pause;

    p.labels?.forEach((text, line) => labels.push({ t, text, line }));

    const after = p.after;
    if (after.kind === "clear") {
      for (const id of after.cleared) {
        pushCell(id, [
          [t, 1],
          [t + T.flash * 0.25, 0.25],
          [t + T.flash * 0.5, 1],
          [t + T.flash * 0.75, 0.25],
          [t + T.flash, 0],
        ]);
      }
      t += T.flash;
      for (const { id, dy } of after.shifts) {
        const before = cellShift.get(id) ?? 0;
        cellShift.set(id, before + dy);
        pushShift(id, t, before, before + dy);
      }
      t += T.shift;
    } else if (after.kind === "topOut") {
      for (const id of after.cleared) pushCell(id, [[t, 1], [t + T.topOut, 0]]);
      t += T.topOut;
    }
    t += T.gap;
  }

  const fadeStart = t + T.hold;
  const duration = fadeStart + T.fade + T.blank;

  function shiftCss(id: number, rows: number, opacity: number): string {
    const owner = cellOwner.get(id)!;
    const [x, y] = localShift(pieceDeg.get(owner)!, rows);
    return `transform:translate(${x}px,${y}px);opacity:${opacity}`;
  }
  function frames(id: number): Frame[] {
    let f = cellFrames.get(id);
    if (!f) cellFrames.set(id, (f = []));
    return f;
  }
  function pushCell(id: number, list: [number, number][]) {
    const rows = cellShift.get(id) ?? 0;
    for (const [time, opacity] of list) frames(id).push({ t: time, css: shiftCss(id, rows, opacity) });
  }
  function pushShift(id: number, time: number, from: number, to: number) {
    frames(id).push({ t: time, css: shiftCss(id, from, 1) });
    frames(id).push({ t: time + T.shift, css: shiftCss(id, to, 1) });
  }

  const pct = (time: number) => `${((time / duration) * 100).toFixed(3)}%`;
  const keyframes = (name: string, list: Frame[], prop: string | null) => {
    const wrap = (css: string) => (prop ? `${prop}:${css}` : css);
    const body = [
      `0%{${wrap(list[0].css)}}`,
      ...list.map((f) => `${pct(f.t)}{${wrap(f.css)}}`),
      `100%{${wrap(list[list.length - 1].css)}}`,
    ].join("");
    return `@keyframes ${name}{${body}}`;
  };

  const css: string[] = [
    `.k{transform-origin:0 0;animation-duration:${num(duration)}s;animation-timing-function:linear;animation-iteration-count:infinite}`,
    keyframes(
      "all",
      [
        { t: 0, css: "opacity:1" },
        { t: fadeStart, css: "opacity:1" },
        { t: fadeStart + T.fade, css: "opacity:0" },
      ],
      null,
    ),
    `.all{animation-name:all}`,
  ];
  const body: string[] = [];

  // classic は置いた順（= ミノの番号順）、ホールドのある盤面は全ミノを番号順に描く。
  for (const p of styled ? game.defs : game.pieces) {
    const size = boxSize(p.type);
    const c = size / 2;
    css.push(keyframes(`p${p.index}`, pieceFrames.get(p.index)!, "transform"));
    css.push(`.p${p.index}{animation-name:p${p.index}}`);
    const rects = spawnCells(p.type).map(([cx, cy], i) => {
      const id = p.ids[i];
      const level = p.levels[i];
      const fill = level === 0 ? palette.filler : palette.levels[level - 1];
      const x = num((cx - c) * PITCH + OFF);
      const y = num((cy - c) * PITCH + OFF);
      const f = cellFrames.get(id);
      let cls = "";
      if (f) {
        css.push(keyframes(`c${id}`, [{ t: 0, css: "transform:translate(0px,0px);opacity:1" }, ...f], null));
        css.push(`.c${id}{animation-name:c${id}}`);
        cls = ` class="k c${id}"`;
      }
      return `<rect${cls} x="${x}" y="${y}" width="${SIZE}" height="${SIZE}" rx="2" fill="${fill}"/>`;
    });
    body.push(`<g class="k p${p.index}">${rects.join("")}</g>`);
  }

  // 見せ場の文字。盤面の上のほうに出してフェードさせる。
  const extra: string[] = [];
  labels.forEach((l, i) => {
    css.push(
      keyframes(
        `l${i}`,
        [
          { t: 0, css: "opacity:0" },
          { t: l.t, css: "opacity:0" },
          { t: l.t + T.labelIn, css: "opacity:1" },
          { t: l.t + T.labelIn + T.labelShow, css: "opacity:1" },
          { t: l.t + T.labelIn + T.labelShow + T.labelOut, css: "opacity:0" },
        ],
        null,
      ),
    );
    css.push(`.l${i}{animation-name:l${i}}`);
    const cx = MARGIN + left + (game.width * PITCH) / 2;
    const cy = MARGIN + PITCH * 5 + l.line * 22;
    const w = l.text.length * 8 + 16;
    extra.push(
      `<g class="k l${i}"><rect x="${num(cx - w / 2)}" y="${cy - 11}" width="${w}" height="20" rx="4" fill="${palette.labelBg}" fill-opacity="0.85"/>` +
        `<text x="${num(cx)}" y="${cy + 4}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12" font-weight="700" letter-spacing="0.5" fill="${palette.accent}">${l.text}</text></g>`,
    );
  });

  const grid: string[] = [];
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      grid.push(
        `<rect x="${MARGIN + left + x * PITCH + OFF}" y="${MARGIN + y * PITCH + OFF}" width="${SIZE}" height="${SIZE}" rx="2"/>`,
      );
    }
  }
  const holdBox = styled
    ? `<rect x="${MARGIN + OFF}" y="${MARGIN + OFF}" width="${4 * PITCH - 2 * OFF}" height="${3 * PITCH - 2 * OFF}" rx="4" fill="none" stroke="${palette.empty}" stroke-width="2"/>` +
      `<text x="${MARGIN + 2 * PITCH}" y="${MARGIN + 3 * PITCH + 12}" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="9" font-weight="700" letter-spacing="1" fill="${palette.text}">HOLD</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${num(width * scale)}" height="${num(height * scale)}">`,
    `<style>${css.join("")}</style>`,
    `<defs><clipPath id="board"><rect x="0" y="${MARGIN}" width="${width}" height="${height - MARGIN}"/></clipPath></defs>`,
    `${holdBox}<g fill="${palette.empty}">${grid.join("")}</g>`,
    `<g clip-path="url(#board)"><g class="k all">${body.join("")}${extra.join("")}</g></g>`,
    `</svg>`,
  ].join("");
}
