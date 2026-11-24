// 7種のミノの形と SRS の回転補正（キック）テーブル。
// 座標は y が下向き。各ミノは正方形の箱（I は 4x4、O は 2x2、それ以外は 3x3）の中に置き、
// 回転は箱の中心まわりの 90 度回転として扱う（SRS の回転はこれと一致する）。

export type PieceType = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export const PIECE_TYPES: PieceType[] = ["I", "O", "T", "S", "Z", "J", "L"];

export type Cell = readonly [x: number, y: number];
export type Rotation = 0 | 1 | 2 | 3;

const SPAWN: Record<PieceType, { size: number; cells: Cell[] }> = {
  I: { size: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { size: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { size: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
};

export function boxSize(type: PieceType): number {
  return SPAWN[type].size;
}

/** 回転前（出現時）の形。セルの並び順は描画と草の割り当てで共通に使う。 */
export function spawnCells(type: PieceType): Cell[] {
  return SPAWN[type].cells;
}

/** 回転状態 r のセル。並び順は spawnCells と対応している。 */
export function cellsOf(type: PieceType, r: Rotation): Cell[] {
  const n = SPAWN[type].size - 1;
  return SPAWN[type].cells.map(([x, y]) => {
    let cx = x;
    let cy = y;
    for (let i = 0; i < r; i++) {
      const nx = n - cy;
      cy = cx;
      cx = nx;
    }
    return [cx, cy] as const;
  });
}

// ガイドラインのキック表は y が上向きなので、ここでは y の符号を反転して持つ。
type Kicks = Record<string, Cell[]>;
const flip = (list: [number, number][]): Cell[] => list.map(([x, y]) => [x, -y || 0] as const);

const JLSTZ_KICKS: Kicks = {
  "0>1": flip([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  "1>0": flip([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  "1>2": flip([[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]]),
  "2>1": flip([[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]),
  "2>3": flip([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
  "3>2": flip([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  "3>0": flip([[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]),
  "0>3": flip([[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]),
};

const I_KICKS: Kicks = {
  "0>1": flip([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  "1>0": flip([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  "1>2": flip([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
  "2>1": flip([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  "2>3": flip([[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]]),
  "3>2": flip([[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]]),
  "3>0": flip([[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]]),
  "0>3": flip([[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]),
};

export function kicks(type: PieceType, from: Rotation, to: Rotation): Cell[] {
  if (type === "O") return [[0, 0]];
  return (type === "I" ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`];
}
