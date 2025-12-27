import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-key";

const matchesModule = await import("./matches.service.js");
const { confirmMatch } = matchesModule;

const filterRows = (rows, filters) =>
  rows.filter((row) =>
    filters.every(({ column, op, value }) => {
      if (op === "eq") return row[column] === value;
      if (op === "in") return value.includes(row[column]);
      if (op === "gt") return (row[column] ?? 0) > value;
      return false;
    })
  );

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.mode = "select";
    this.payload = null;
    this.filters = [];
    this.isSingle = false;
    this.onConflict = null;
  }

  select() {
    this.mode = "select";
    return this;
  }

  update(values) {
    this.mode = "update";
    this.payload = values;
    return this;
  }

  upsert(rows, options = {}) {
    this.mode = "upsert";
    this.payload = rows;
    this.onConflict = options.onConflict;
    return this.execute();
  }

  eq(column, value) {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  in(column, values) {
    this.filters.push({ column, op: "in", value: values });
    return this;
  }

  gt(column, value) {
    this.filters.push({ column, op: "gt", value });
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async execute() {
    const tableData = this.db.tables[this.table];

    if (!tableData) {
      return { data: null, error: { message: `Unknown table ${this.table}` } };
    }

    const matchingRows = filterRows(tableData, this.filters);

    if (this.mode === "select") {
      const data = this.isSingle ? matchingRows[0] : matchingRows;
      const error = this.isSingle && !data ? { message: "Not found", code: "PGRST116" } : null;
      return { data, error };
    }

    if (this.mode === "update") {
      matchingRows.forEach((row) => Object.assign(row, this.payload));
      return { data: matchingRows, error: null };
    }

    if (this.mode === "upsert") {
      if (this.table === "elo_history" && this.onConflict === "auth_id,match_id") {
        this.payload.forEach((row) => {
          const existing = this.db.tables.elo_history.find(
            (r) => r.auth_id === row.auth_id && r.match_id === row.match_id
          );

          if (existing) {
            Object.assign(existing, row);
          } else {
            this.db.tables.elo_history.push({ ...row });
          }
        });
      } else {
        this.db.tables[this.table].push(...this.payload.map((row) => ({ ...row })));
      }

      return { data: this.payload, error: null };
    }

    return { data: null, error: { message: "Unsupported operation" } };
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }
}

class SupabaseMock {
  constructor(seed) {
    this.tables = {
      matches: seed.matches,
      match_players: seed.match_players,
      users: seed.users,
      elo_history: seed.elo_history ?? [],
    };
    this.rpcCalls = [];
  }

  from(table) {
    return new QueryBuilder(this, table);
  }

  rpc(fnName, params) {
    this.rpcCalls.push({ fnName, params });

    if (fnName === "confirm_match_tx") {
      const {
        p_match_id,
        p_discipline,
        p_updates = [],
        p_played_at,
        p_confirmed_at,
        p_elo_change_side_a,
        p_elo_change_side_b,
      } = params ?? {};

      p_updates.forEach((update) => {
        const user = this.tables.users.find((u) => u.auth_id === update.auth_id);
        if (!user) return;

        const oldOverall = user.overall_elo ?? null;
        user.singles_matches_played = user.singles_matches_played ?? 0;
        user.doubles_matches_played = user.doubles_matches_played ?? 0;

        if (p_discipline === "singles") {
          user.singles_elo = update.new_elo;
          user.singles_matches_played += 1;
        } else {
          user.doubles_elo = update.new_elo;
          user.doubles_matches_played += 1;
        }

        const totalMatches = (user.singles_matches_played ?? 0) + (user.doubles_matches_played ?? 0);
        const newOverall =
          totalMatches > 0
            ? Math.round(
                ((user.singles_elo ?? 1000) * (user.singles_matches_played ?? 0) +
                  (user.doubles_elo ?? 1000) * (user.doubles_matches_played ?? 0)) /
                  totalMatches
              )
            : null;

        user.overall_elo = newOverall;

        const historyRow = {
          auth_id: update.auth_id,
          match_id: p_match_id,
          discipline: p_discipline,
          old_elo: update.old_elo,
          new_elo: update.new_elo,
          old_overall_elo: oldOverall,
          new_overall_elo: newOverall,
          created_at: p_played_at,
        };

        const existing = this.tables.elo_history.find(
          (row) => row.auth_id === update.auth_id && row.match_id === p_match_id
        );

        if (existing) {
          Object.assign(existing, historyRow);
        } else {
          this.tables.elo_history.push(historyRow);
        }
      });

      const match = this.tables.matches.find((m) => m.match_id === p_match_id);
      if (match) {
        match.status = "confirmed";
        match.confirmed_at = p_confirmed_at;
        match.elo_change_side_a = p_elo_change_side_a;
        match.elo_change_side_b = p_elo_change_side_b;
      }

      return Promise.resolve({ data: { updated: p_updates.length }, error: null });
    }

    return Promise.resolve({ data: null, error: null });
  }
}

test("confirmMatch updates singles singles_elo and history with discipline", async () => {
  const playedAt = "2024-01-01T00:00:00.000Z";
  const supabaseMock = new SupabaseMock({
    matches: [
      {
        match_id: "match-1",
        match_type: "singles",
        discipline: "singles",
        status: "pending",
        score: "6-4,6-4",
        submitted_by: "player-a",
        needs_confirmation_from_list: ["player-b"],
        played_at: playedAt,
        team_a_auth_ids: ["player-a"],
        team_b_auth_ids: ["player-b"],
      },
    ],
    match_players: [
      { match_id: "match-1", auth_id: "player-a", team: "A", is_winner: true },
      { match_id: "match-1", auth_id: "player-b", team: "B", is_winner: false },
    ],
    users: [
      {
        auth_id: "player-a",
        singles_elo: 1000,
        doubles_elo: 1000,
        singles_matches_played: 0,
        doubles_matches_played: 0,
        overall_elo: null,
      },
      {
        auth_id: "player-b",
        singles_elo: 1000,
        doubles_elo: 1000,
        singles_matches_played: 0,
        doubles_matches_played: 0,
        overall_elo: null,
      },
    ],
    elo_history: [],
  });

  const firstResult = await confirmMatch("match-1", "player-b", supabaseMock);

  assert.equal(firstResult.status, "confirmed");
  assert.equal(firstResult.elo_change_side_a, 33);
  assert.equal(firstResult.elo_change_side_b, -33);
  assert.equal(firstResult.discipline, "singles");
  assert.equal(supabaseMock.tables.elo_history.length, 2);

  const playerAHistory = supabaseMock.tables.elo_history.find((row) => row.auth_id === "player-a");
  const playerBHistory = supabaseMock.tables.elo_history.find((row) => row.auth_id === "player-b");

  assert.equal(playerAHistory.old_elo, 1000);
  assert.equal(playerAHistory.new_elo, 1033);
  assert.equal(playerAHistory.old_overall_elo, null);
  assert.equal(playerAHistory.new_overall_elo, 1033);
  assert.equal(playerAHistory.discipline, "singles");
  assert.equal(playerAHistory.created_at, playedAt);
  assert.equal(playerBHistory.old_elo, 1000);
  assert.equal(playerBHistory.new_elo, 967);
  assert.equal(playerBHistory.old_overall_elo, null);
  assert.equal(playerBHistory.new_overall_elo, 967);
  assert.equal(playerBHistory.discipline, "singles");
  assert.equal(playerBHistory.created_at, playedAt);

  const [match] = supabaseMock.tables.matches;
  assert.equal(match.status, "confirmed");
  assert.equal(match.elo_change_side_a, 33);
  assert.equal(match.elo_change_side_b, -33);

  const playerA = supabaseMock.tables.users.find((u) => u.auth_id === "player-a");
  const playerB = supabaseMock.tables.users.find((u) => u.auth_id === "player-b");

  assert.equal(playerA.singles_matches_played, 1);
  assert.equal(playerA.doubles_matches_played, 0);
  assert.equal(playerA.overall_elo, 1033);
  assert.equal(playerB.singles_matches_played, 1);
  assert.equal(playerB.doubles_matches_played, 0);
  assert.equal(playerB.overall_elo, 967);

  assert.equal(supabaseMock.rpcCalls.length, 1);
  assert.equal(supabaseMock.rpcCalls[0].fnName, "confirm_match_tx");
});

test("confirmMatch updates doubles ratings and history", async () => {
  const supabaseMock = new SupabaseMock({
    matches: [
      {
        match_id: "match-2",
        match_type: "doubles",
        discipline: "doubles",
        status: "pending",
        score: "6-4,6-4",
        submitted_by: "player-a",
        needs_confirmation_from_list: ["player-c", "player-d"],
        team_a_auth_ids: ["player-a", "player-b"],
        team_b_auth_ids: ["player-c", "player-d"],
      },
    ],
    match_players: [
      { match_id: "match-2", auth_id: "player-a", team: "A", is_winner: true },
      { match_id: "match-2", auth_id: "player-b", team: "A", is_winner: true },
      { match_id: "match-2", auth_id: "player-c", team: "B", is_winner: false },
      { match_id: "match-2", auth_id: "player-d", team: "B", is_winner: false },
    ],
    users: [
      {
        auth_id: "player-a",
        singles_elo: 1000,
        doubles_elo: 1000,
        singles_matches_played: 0,
        doubles_matches_played: 0,
        overall_elo: null,
      },
      {
        auth_id: "player-b",
        singles_elo: 1000,
        doubles_elo: 1000,
        singles_matches_played: 0,
        doubles_matches_played: 0,
        overall_elo: null,
      },
      {
        auth_id: "player-c",
        singles_elo: 1000,
        doubles_elo: 1000,
        singles_matches_played: 0,
        doubles_matches_played: 0,
        overall_elo: null,
      },
      {
        auth_id: "player-d",
        singles_elo: 1000,
        doubles_elo: 1000,
        singles_matches_played: 0,
        doubles_matches_played: 0,
        overall_elo: null,
      },
    ],
    elo_history: [],
  });

  const result = await confirmMatch("match-2", "player-c", supabaseMock);

  assert.equal(result.status, "confirmed");
  assert.equal(result.discipline, "doubles");
  assert.equal(result.elo_change_side_a, 33);
  assert.equal(result.elo_change_side_b, -33);

  const updatedUsers = supabaseMock.tables.users.reduce(
    (acc, user) => ({ ...acc, [user.auth_id]: user.doubles_elo }),
    {}
  );

  assert.equal(updatedUsers["player-a"], 1033);
  assert.equal(updatedUsers["player-b"], 1033);
  assert.equal(updatedUsers["player-c"], 967);
  assert.equal(updatedUsers["player-d"], 967);

  supabaseMock.tables.elo_history.forEach((row) => {
    assert.equal(row.discipline, "doubles");
    assert.equal(row.old_overall_elo, null);
    if (["player-a", "player-b"].includes(row.auth_id)) {
      assert.equal(row.new_overall_elo, 1033);
    } else {
      assert.equal(row.new_overall_elo, 967);
    }
  });

  supabaseMock.tables.users.forEach((user) => {
    assert.equal(user.singles_matches_played, 0);
    assert.equal(user.doubles_matches_played, 1);
  });

  assert.equal(supabaseMock.tables.users.find((u) => u.auth_id === "player-a").overall_elo, 1033);
  assert.equal(supabaseMock.tables.users.find((u) => u.auth_id === "player-c").overall_elo, 967);

  assert.equal(supabaseMock.rpcCalls.length, 1);
  assert.equal(supabaseMock.rpcCalls[0].fnName, "confirm_match_tx");
});

test("confirmMatch prevents confirming an already confirmed match", async () => {
  const supabaseMock = new SupabaseMock({
    matches: [
      {
        match_id: "match-3",
        match_type: "singles",
        discipline: "singles",
        status: "pending",
        score: "6-4,6-4",
        submitted_by: "player-a",
        needs_confirmation_from_list: ["player-b"],
        team_a_auth_ids: ["player-a"],
        team_b_auth_ids: ["player-b"],
      },
    ],
    match_players: [
      { match_id: "match-3", auth_id: "player-a", team: "A", is_winner: true },
      { match_id: "match-3", auth_id: "player-b", team: "B", is_winner: false },
    ],
    users: [
      { auth_id: "player-a", singles_elo: 1000, doubles_elo: 1000 },
      { auth_id: "player-b", singles_elo: 1000, doubles_elo: 1000 },
    ],
    elo_history: [],
  });

  await confirmMatch("match-3", "player-b", supabaseMock);
  await assert.rejects(() => confirmMatch("match-3", "player-b", supabaseMock), (err) => {
    assert.equal(err.status, 409);
    return true;
  });
});

test("confirmMatch validates doubles team requirements", async () => {
  const supabaseMock = new SupabaseMock({
    matches: [
      {
        match_id: "match-4",
        match_type: "doubles",
        discipline: "doubles",
        status: "pending",
        score: "6-4,6-4",
        submitted_by: "player-a",
        needs_confirmation_from_list: ["player-c"],
        team_a_auth_ids: ["player-a", "player-b"],
        team_b_auth_ids: ["player-b", "player-c"],
      },
    ],
    match_players: [
      { match_id: "match-4", auth_id: "player-a", team: "A", is_winner: true },
      { match_id: "match-4", auth_id: "player-b", team: "A", is_winner: true },
      { match_id: "match-4", auth_id: "player-b", team: "B", is_winner: false },
      { match_id: "match-4", auth_id: "player-c", team: "B", is_winner: false },
    ],
    users: [
      { auth_id: "player-a", singles_elo: 1000, doubles_elo: 1000 },
      { auth_id: "player-b", singles_elo: 1000, doubles_elo: 1000 },
      { auth_id: "player-c", singles_elo: 1000, doubles_elo: 1000 },
    ],
    elo_history: [],
  });

  await assert.rejects(() => confirmMatch("match-4", "player-c", supabaseMock), (err) => {
    assert.equal(err.status, 400);
    return true;
  });
});
