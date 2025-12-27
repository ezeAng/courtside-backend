import { test } from "node:test";
import assert from "node:assert/strict";

import { parseScore } from "../../scoreParser.service.js";
import { computeEloDelta } from "./eloFormulaV2.js";

const K_FACTOR = 32;

test("dominant wins produce larger deltas than close wins", () => {
  const closeParsed = parseScore("21-19,21-19");
  const blowoutParsed = parseScore("21-8,21-10");

  const closeWin = computeEloDelta({
    ratingA: 1000,
    ratingB: 1000,
    scoreA: 1,
    parsedScore: closeParsed,
    kFactor: K_FACTOR,
    mode: "singles",
  });

  const blowoutWin = computeEloDelta({
    ratingA: 1000,
    ratingB: 1000,
    scoreA: 1,
    parsedScore: blowoutParsed,
    kFactor: K_FACTOR,
    mode: "singles",
  });

  assert.ok(Math.abs(blowoutWin.deltaA) > Math.abs(closeWin.deltaA));
});

test("upset wins move ratings more than expected wins", () => {
  const parsedScore = parseScore("21-18,21-17");

  const upsetWin = computeEloDelta({
    ratingA: 900,
    ratingB: 1100,
    scoreA: 1,
    parsedScore,
    kFactor: K_FACTOR,
    mode: "singles",
  });

  const expectedWin = computeEloDelta({
    ratingA: 1100,
    ratingB: 900,
    scoreA: 1,
    parsedScore,
    kFactor: K_FACTOR,
    mode: "singles",
  });

  assert.ok(upsetWin.deltaA > 0);
  assert.ok(Math.abs(upsetWin.deltaA) > Math.abs(expectedWin.deltaA));
});

test("draws keep legacy fixed bonuses", () => {
  const drawDelta = computeEloDelta({
    ratingA: 1200,
    ratingB: 900,
    scoreA: 0.5,
    parsedScore: { is_draw: true },
    kFactor: K_FACTOR,
    mode: "doubles",
  });

  assert.equal(drawDelta.deltaA, 5);
  assert.equal(drawDelta.deltaB, 5);
});

test("singles and doubles remain symmetric for each side", () => {
  const parsedScore = parseScore("21-15,21-13");

  const singles = computeEloDelta({
    ratingA: 1050,
    ratingB: 1025,
    scoreA: 1,
    parsedScore,
    kFactor: K_FACTOR,
    mode: "singles",
  });

  const doubles = computeEloDelta({
    ratingA: 1050,
    ratingB: 1025,
    scoreA: 1,
    parsedScore,
    kFactor: K_FACTOR,
    mode: "doubles",
  });

  assert.equal(singles.deltaA, -singles.deltaB);
  assert.equal(doubles.deltaA, -doubles.deltaB);
  assert.equal(Math.round(singles.deltaA * 1000), Math.round(doubles.deltaA * 1000));
});
