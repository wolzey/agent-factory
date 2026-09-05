import { expect, it } from "vitest";
import { Vector3 } from "three";
import { DuckRound } from "../client/prototypes/factory25dDuckHunt";
import { crossedBasket } from "../client/prototypes/factory25dBasketball";

it("counts each duck once per flight and requires ammunition", () => {
  const game = new DuckRound();
  game.start();
  expect(game.shoot(0)).toBe(true);
  expect(game.shoot(0)).toBe(false);
  expect(game.shoot(null)).toBe(false);
  expect(game.shoot(1)).toBe(false);
  expect(game.score).toBe(1);
  game.newFlight();
  expect(game.shoot(0)).toBe(true);
  expect(game.score).toBe(2);
});
it("ends the round and resets score and ammo for a new game", () => {
  const game = new DuckRound();
  game.start();
  game.shoot(0);
  for (let i = 0; i < 301; i++) game.tick(0.1);
  expect(game.active).toBe(false);
  expect(game.shoot(1)).toBe(false);
  game.start();
  expect(game.score).toBe(0);
  expect(game.shots).toBe(3);
  expect(game.hit.size).toBe(0);
});
it("only scores a downward crossing inside the rim, including a fast frame", () => {
  const rim = new Vector3(1.3, 1.16, -6.08);
  expect(
    crossedBasket(
      rim.clone().add(new Vector3(0, 0.2, 0)),
      rim.clone().add(new Vector3(0, -0.3, 0)),
      rim,
    ),
  ).toBe(true);
  expect(
    crossedBasket(
      rim.clone().add(new Vector3(0, -0.2, 0)),
      rim.clone().add(new Vector3(0, 0.3, 0)),
      rim,
    ),
  ).toBe(false);
  expect(
    crossedBasket(
      rim.clone().add(new Vector3(0.25, 0.2, 0)),
      rim.clone().add(new Vector3(0.25, -0.2, 0)),
      rim,
    ),
  ).toBe(false);
  expect(
    crossedBasket(
      rim.clone().add(new Vector3(0, 0.3, 0)),
      rim.clone().add(new Vector3(0, 0.1, 0)),
      rim,
    ),
  ).toBe(false);
});
