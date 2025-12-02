export const parseScore = (scoreText) => {
  if (!scoreText || typeof scoreText !== "string") {
    throw new Error("Score text is required");
  }

  const setsRaw = scoreText.split(",").map((set) => set.trim()).filter(Boolean);

  if (setsRaw.length === 0 || setsRaw.length > 3) {
    throw new Error("Score must contain between 1 and 3 sets");
  }

  const sets = [];
  let teamA_sets_won = 0;
  let teamB_sets_won = 0;

  setsRaw.forEach((setScore) => {
    const [aScoreText, bScoreText] = setScore.split("-").map((score) => score.trim());

    const a = Number(aScoreText);
    const b = Number(bScoreText);

    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      throw new Error("Set scores must be integers");
    }

    sets.push({ a, b });

    if (a > b) {
      teamA_sets_won += 1;
    } else if (b > a) {
      teamB_sets_won += 1;
    } else {
      throw new Error("Set scores cannot be tied");
    }
  });

  if (teamA_sets_won === teamB_sets_won) {
    throw new Error("Score must produce a winner");
  }

  const winner_team = teamA_sets_won > teamB_sets_won ? "A" : "B";

  return {
    sets,
    teamA_sets_won,
    teamB_sets_won,
    winner_team,
  };
};
