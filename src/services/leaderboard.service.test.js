import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role";

const leaderboardModule = await import("./leaderboard.service.js");
const { getLeaderboard } = leaderboardModule;

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
    this.tables = seed;
  }

  from(table) {
    return new QueryBuilder(this, table);
  }
}

test("getLeaderboard returns singles leaderboard by default", async () => {
  const supabaseMock = new SupabaseMock({
    users: [
      { auth_id: "a", username: "Alice", gender: "female", elo: 1200, elo_doubles: 1100, profile_image_url: null },
      { auth_id: "b", username: "Bob", gender: "male", elo: 1300, elo_doubles: 1250, profile_image_url: null },
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
      { auth_id: "a", username: "Alice", gender: "female", elo: 1200, elo_doubles: 1400, profile_image_url: null },
      { auth_id: "b", username: "Bob", gender: "male", elo: 1300, elo_doubles: 1350, profile_image_url: null },
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
