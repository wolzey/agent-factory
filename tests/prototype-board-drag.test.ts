import { expect, it } from "vitest";
import {
  boardPositionIsClear,
  moveBoard,
} from "../client/prototypes/factory25dBoardDrag";

it("rolls through open floor, stops at walls and cannot tunnel across a workstation", () => {
  const start = { x: -7, z: -2.35 };
  expect(moveBoard(start, { x: 2, z: -2.35 })).toEqual({
    x: expect.closeTo(2),
    z: -2.35,
  });
  const againstDesk = moveBoard({ x: -6.25, z: -2.35 }, { x: -6.25, z: -4.6 });
  expect(againstDesk.z).toBeGreaterThanOrEqual(-3.01);
  expect(boardPositionIsClear(againstDesk)).toBe(true);
  const wall = moveBoard(start, { x: -20, z: 2.4 });
  expect(wall.x).toBeGreaterThanOrEqual(-7.25);
  expect(boardPositionIsClear(wall)).toBe(true);
  expect(boardPositionIsClear({ x: NaN, z: 0 })).toBe(false);
});

it("coasts to rest while staying clear of cabinets after a fast release", async () => {
  const { coastBoard } = await import(
    "../client/prototypes/factory25dBoardDrag"
  );
  let state = { position: { x: -6.25, z: -2.35 }, velocity: { x: 0, z: -8 } };
  for (let i = 0; i < 240; i++) {
    state = coastBoard(state.position, state.velocity, 1 / 60);
    expect(boardPositionIsClear(state.position)).toBe(true);
  }
  expect(state.position.z).toBeGreaterThanOrEqual(-3.01);
  expect(Math.hypot(state.velocity.x, state.velocity.z)).toBeLessThan(0.001);
});
