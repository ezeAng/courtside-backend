const ALPHA = 0.9;
const BETA = 0.4;
const GAMMA = 0.6;
const P0 = 15;
const MAX_SETS = 3;
const DRAW_BONUS = 5;
const CLAMP_MIN = -60;
const CLAMP_MAX = 60;
const VARIABILITY_SCALE = 1.25;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const expectedScore = (playerElo, opponentElo) => 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));

const computePointsDiff = (sets = []) => {
  if (!Array.isArray(sets) || sets.length === 0) {
    return 0;
  }

  const diff = sets.reduce((sum, set) => {
    const a = Number(set?.a ?? 0);
    const b = Number(set?.b ?? 0);
    return sum + (a - b);
  }, 0);

  return Math.abs(diff);
};

const computeSetsDiff = (parsedScore = {}) => {
  const teamA_sets_won = Number(parsedScore?.teamA_sets_won ?? 0);
  const teamB_sets_won = Number(parsedScore?.teamB_sets_won ?? 0);
  return Math.abs(teamA_sets_won - teamB_sets_won);
};

export const computeEloDelta = ({ ratingA, ratingB, scoreA, parsedScore, kFactor, mode }) => {
  const expectedScoreA = expectedScore(ratingA, ratingB);

  if (parsedScore?.is_draw) {
    return { deltaA: DRAW_BONUS, deltaB: DRAW_BONUS };
  }

  const pointsDiff = computePointsDiff(parsedScore?.sets);
  const setsDiff = computeSetsDiff(parsedScore);

  const pointsFactor = 1 + ALPHA * Math.tanh(pointsDiff / P0);
  const setsFactor = 1 + BETA * (setsDiff / MAX_SETS);
  const marginOfVictory = Math.max(1, pointsFactor * setsFactor);

  const upsetFactor = 1 + GAMMA * Math.abs(scoreA - expectedScoreA);

  const baseDelta = kFactor * (scoreA - expectedScoreA);
  const deltaAUnclamped = baseDelta * marginOfVictory * upsetFactor * VARIABILITY_SCALE;
  const deltaA = clamp(deltaAUnclamped, CLAMP_MIN, CLAMP_MAX);

  return {
    deltaA,
    deltaB: -deltaA,
  };
};
