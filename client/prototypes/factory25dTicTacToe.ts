export type Mark = 'X' | 'O';
export type Game = ReadonlyArray<Mark | null>;

const winningLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
] as const;

export function gameResult(game: Game): Mark | 'draw' | null {
  for (const [a, b, c] of winningLines) {
    if (game[a] && game[a] === game[b] && game[a] === game[c]) return game[a];
  }
  return game.every(Boolean) ? 'draw' : null;
}

export function nextMark(game: Game): Mark {
  return game.filter(Boolean).length % 2 === 0 ? 'X' : 'O';
}

export function playSquare(game: Game, index: number): Game {
  if (!Number.isInteger(index) || index < 0 || index > 8 || game[index] || gameResult(game)) return game;
  return game.map((mark, cell) => cell === index ? nextMark(game) : mark);
}
