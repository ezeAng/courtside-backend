import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role";

const leaderboardModule = await import("./leaderboard.service.js");
const { getLeaderboard, getOverallLeaderboard } = leaderboardModule;

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.sort = null;
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  order(column, { ascending }) {
    this.sort = { column, ascending };
    return this;
  }

  limit() {
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });
    return this;
  }

  async then(onFulfilled, onRejected) {
    try {
      const data = this.execute();
      return Promise.resolve(onFulfilled(data));
    } catch (err) {
      return Promise.reject(onRejected ? onRejected(err) : err);
    }
  }

  execute() {
    let rows = [...(this.db.tables[this.table] || [])];

    this.filters.forEach(({ column, value }) => {
      rows = rows.filter((row) => row[column] === value);
    });

    if (this.sort) {
      const { column, ascending } = this.sort;
      rows.sort((a, b) => {
        if (a[column] === b[column]) return 0;
        return ascending ? a[column] - b[column] : b[column] - a[column];
      });
    }

    return { data: rows, error: null };
  }
}

class SupabaseMock {
  constructor(seed) {
    this.tables = seed.tables ?? seed;
    this.rpcResponses = seed.rpcResponses || {};
    this.rpcCalls = [];
  }

  from(table) {
    return new QueryBuilder(this, table);
  }

  rpc(fnName, params) {
    this.rpcCalls.push({ fnName, params });
    const responder = this.rpcResponses[fnName];

    if (typeof responder === "function") {
      return Promise.resolve(responder(params));
    }

    return Promise.resolve({ data: [], error: null });
  }
}

test("getLeaderboard returns singles leaderboard by default", async () => {
  const supabaseMock = new SupabaseMock({
    users: [
      { auth_id: "a", username: "Alice", gender: "female", singles_elo: 1200, doubles_elo: 1100, profile_image_url: null },
      { auth_id: "b", username: "Bob", gender: "male", singles_elo: 1300, doubles_elo: 1250, profile_image_url: null },
    ],
  });

  const result = await getLeaderboard("mixed", undefined, supabaseMock);

  assert.equal(result.gender, "mixed");
  assert.equal(result.discipline, "singles");
  assert.deepEqual(result.leaders.map((l) => l.auth_id), ["b", "a"]);
  assert.equal(result.leaders[0].rating, 1300);
});

test("getLeaderboard returns doubles leaderboard when requested", async () => {
  const supabaseMock = new SupabaseMock({
    users: [
      { auth_id: "a", username: "Alice", gender: "female", singles_elo: 1200, doubles_elo: 1400, profile_image_url: null },
      { auth_id: "b", username: "Bob", gender: "male", singles_elo: 1300, doubles_elo: 1350, profile_image_url: null },
    ],
  });

  const result = await getLeaderboard("mixed", "doubles", supabaseMock);

  assert.equal(result.gender, "mixed");
  assert.equal(result.discipline, "doubles");
  assert.deepEqual(result.leaders.map((l) => l.auth_id), ["a", "b"]);
  assert.equal(result.leaders[0].rating, 1400);
});

test("getLeaderboard validates discipline", async () => {
  const supabaseMock = new SupabaseMock({ users: [] });

  const result = await getLeaderboard("mixed", "triples", supabaseMock);

  assert.deepEqual(result, { error: "Invalid discipline" });
});

test("getOverallLeaderboard delegates to RPC and maps pagination", async () => {
  const supabaseMock = new SupabaseMock({
    tables: {},
    rpcResponses: {
      get_overall_leaderboard: () => ({
        data: [
          {
            auth_id: "player-a",
            username: "Alice",
            overall_elo: 1400,
            overall_rank: 1,
            singles_elo: 1380,
            doubles_elo: 1420,
            singles_matches_played: 10,
            doubles_matches_played: 8,
          },
        ],
        error: null,
      }),
    },
  });

  const result = await getOverallLeaderboard({ limit: "5", offset: "10" }, supabaseMock);

  assert.equal(result.limit, 5);
  assert.equal(result.offset, 10);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].auth_id, "player-a");
  assert.deepEqual(supabaseMock.rpcCalls, [
    {
      fnName: "get_overall_leaderboard",
      params: { p_limit: 5, p_offset: 10 },
    },
  ]);
});
