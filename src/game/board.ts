// 盤面: 衝突判定・固定・ライン消去。
// 行は上から 0, 1, 2, ...。上から HIDDEN 行は見えない出現用の領域。
// 各マスには、置かれたブロックの ID（描画で追いかけるため）か -1 が入る。

import { cellsOf, type PieceType, type Rotation } from "./pieces.js";

export const HIDDEN = 4;
export const EMPTY = -1;

export interface PieceState {
  x: number;
  y: number;
  r: Rotation;
}

export class Board {
  readonly width: number;
  readonly height: number; // 見える行数
  readonly rows: number; // HIDDEN を含めた全行数
  grid: number[][];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.rows = height + HIDDEN;
    this.grid = Array.from({ length: this.rows }, () => new Array<number>(width).fill(EMPTY));
  }

  clone(): Board {
    const b = new Board(this.width, this.height);
    b.grid = this.grid.map((row) => [...row]);
    return b;
  }

  filled(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y >= this.rows) return true;
    if (y < 0) return false;
    return this.grid[y][x] !== EMPTY;
  }

  fits(type: PieceType, s: PieceState): boolean {
    return cellsOf(type, s.r).every(([cx, cy]) => !this.filled(s.x + cx, s.y + cy));
  }

  /**
   * ミノを固定する。ids は spawnCells の並び順に対応するブロック ID。
   * 見えない領域にはみ出したら topOut を true で返す。
   */
  lock(type: PieceType, s: PieceState, ids: number[]): { topOut: boolean } {
    let topOut = false;
    cellsOf(type, s.r).forEach(([cx, cy], i) => {
      const y = s.y + cy;
      if (y < HIDDEN) topOut = true;
      if (y >= 0) this.grid[y][s.x + cx] = ids[i];
    });
    return { topOut };
  }

  /**
   * そろった行を消して上を詰める。
   * 返り値: 消えた行の番号、消えたブロック ID、下に詰まったブロックとその量。
   */
  clearLines(): { rows: number[]; cleared: number[]; shifts: { id: number; dy: number }[] } {
    const full: number[] = [];
    for (let y = 0; y < this.rows; y++) {
      if (this.grid[y].every((v) => v !== EMPTY)) full.push(y);
    }
    if (full.length === 0) return { rows: [], cleared: [], shifts: [] };

    const cleared = full.flatMap((y) => this.grid[y]);
    const shifts: { id: number; dy: number }[] = [];
    for (let y = 0; y < this.rows; y++) {
      if (full.includes(y)) continue;
      const dy = full.filter((fy) => fy > y).length;
      if (dy === 0) continue;
      for (const id of this.grid[y]) if (id !== EMPTY) shifts.push({ id, dy });
    }

    const kept = this.grid.filter((_, y) => !full.includes(y));
    const fresh = full.map(() => new Array<number>(this.width).fill(EMPTY));
    this.grid = [...fresh, ...kept];
    return { rows: full, cleared, shifts };
  }

  /** 盤面に残っている全ブロック ID。 */
  allIds(): number[] {
    return this.grid.flat().filter((v) => v !== EMPTY);
  }

  reset(): void {
    for (const row of this.grid) row.fill(EMPTY);
  }
}
