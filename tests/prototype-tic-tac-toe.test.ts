import { describe, expect, it } from 'vitest';
import { gameResult, nextMark, playSquare } from '../client/prototypes/factory25dTicTacToe';
import type { Game } from '../client/prototypes/factory25dTicTacToe';

const empty = (): Game => Array(9).fill(null);
const moves = (indices: number[]) => indices.reduce<Game>((game, index) => playSquare(game, index), empty());

describe('whiteboard tic-tac-toe', () => {
  it('alternates marks without mutating the previous board', () => {
    const start = empty();
    const first = playSquare(start, 4);
    const second = playSquare(first, 0);
    expect(start.every(mark => mark === null)).toBe(true);
    expect(first[4]).toBe('X');
    expect(second[0]).toBe('O');
    expect(nextMark(second)).toBe('X');
  });

  it('rejects occupied and invalid squares without consuming a turn', () => {
    const game = moves([4]);
    for (const index of [4, -1, 9, 1.5, NaN]) expect(playSquare(game, index)).toBe(game);
    expect(nextMark(game)).toBe('O');
  });

  it.each([
    [[0, 3, 1, 4, 2], 'X'],
    [[0, 1, 3, 4, 8, 7], 'O'],
    [[0, 1, 4, 2, 8], 'X'],
    [[2, 0, 4, 1, 6], 'X'],
  ] as const)('ends a winning line and rejects later moves: %j', (indices, winner) => {
    const game = moves([...indices]);
    expect(gameResult(game)).toBe(winner);
    expect(playSquare(game, 5)).toBe(game);
  });

  it('ends a full board in a draw', () => {
    expect(gameResult(moves([0, 1, 2, 4, 3, 5, 7, 6, 8]))).toBe('draw');
  });
});
