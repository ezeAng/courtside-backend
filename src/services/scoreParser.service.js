export const parseScore = (scoreText) => {
  if (!scoreText || typeof scoreText !== "string") {
    throw new Error("Score text is required");
  }

  const setsRaw = scoreText
    .split(",")
    .map((set) => set.trim())
    .filter(Boolean);

  if (setsRaw.length === 0 || setsRaw.length > 3) {
    throw new Error("Score must contain between 1 and 3 sets");
  }

  const sets = [];
  let teamA_sets_won = 0;
  let teamB_sets_won = 0;
  let teamA_diff = 0;
  let teamB_diff = 0;

  setsRaw.forEach((setScore) => {
    const [aScoreText, bScoreText] = setScore
      .split("-")
      .map((score) => score.trim());

    const a = Number(aScoreText);
    const b = Number(bScoreText);

    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      throw new Error("Set scores must be integers");
    }

    if (a === b) {
      throw new Error("Set scores cannot be tied");
    }

    sets.push({ a, b });

    if (a > b) {
      teamA_sets_won += 1;
      teamA_diff += a - b;
    } else {
      teamB_sets_won += 1;
      teamB_diff += b - a;
    }
  });

  // Normal case: clear winner by sets
  if (teamA_sets_won !== teamB_sets_won) {
    return {
      sets,
      teamA_sets_won,
      teamB_sets_won,
      winner_team: teamA_sets_won > teamB_sets_won ? "A" : "B",
      is_draw: false,
    };
  }

  // Tie in sets → resolve by total score differential
  if (teamA_diff !== teamB_diff) {
    return {
      sets,
      teamA_sets_won,
      teamB_sets_won,
      winner_team: teamA_diff > teamB_diff ? "A" : "B",
      is_draw: false,
    };
  }

  // True draw (rare but allowed)
  return {
    sets,
    teamA_sets_won,
    teamB_sets_won,
    winner_team: null,
    is_draw: true,
  };
};
