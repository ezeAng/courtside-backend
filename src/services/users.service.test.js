import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-key";

const usersModule = await import("./users.service.js");
const { searchUsers } = usersModule;

class QueryBuilder {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.orderBy = null;
    this.rangeBounds = null;
  }

  select() {
    return this;
  }

  ilike(column, pattern) {
    this.filters.push({ type: "ilike", column, pattern });
    return this;
  }

  order(column, { ascending }) {
    this.orderBy = { column, ascending };
    return this;
  }

  range(from, to) {
    this.rangeBounds = { from, to };
    return this;
  }

  eq(column, value) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  then(onFulfilled, onRejected) {
    try {
      const result = { data: this.execute(), error: null };
      return Promise.resolve(onFulfilled(result));
    } catch (err) {
      return Promise.reject(onRejected ? onRejected(err) : err);
    }
  }

  execute() {
    let rows = [...(this.db.tables[this.table] || [])];

    this.filters.forEach((filter) => {
      if (filter.type === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      }

      if (filter.type === "ilike") {
        const pattern = filter.pattern.toLowerCase().replace(/%/g, "");
        rows = rows.filter((row) => (row[filter.column] || "").toLowerCase().includes(pattern));
      }
    });

    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows.sort((a, b) => {
        if (a[column] === b[column]) return 0;
        return ascending ? a[column] - b[column] : b[column] - a[column];
      });
    }

    if (this.rangeBounds) {
      const { from, to } = this.rangeBounds;
      rows = rows.slice(from, to + 1);
    }

    return rows;
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

test("searchUsers orders by singles ELO by default", async () => {
  const supabaseMock = new SupabaseMock({
    users: [
      { auth_id: "a", username: "alex", gender: "male", singles_elo: 900, doubles_elo: 1300 },
      { auth_id: "b", username: "alexa", gender: "female", singles_elo: 1000, doubles_elo: 1200 },
    ],
  });

  const result = await searchUsers("al", undefined, {}, supabaseMock);

  assert.equal(result.results.length, 2);
  assert.deepEqual(
    result.results.map((user) => ({ auth_id: user.auth_id, singles_elo: user.singles_elo })),
    [
      { auth_id: "b", singles_elo: 1000 },
      { auth_id: "a", singles_elo: 900 },
    ]
  );
});

test("searchUsers orders by doubles ELO when requested", async () => {
  const supabaseMock = new SupabaseMock({
    users: [
      { auth_id: "a", username: "alex", gender: "male", singles_elo: 900, doubles_elo: 1300 },
      { auth_id: "b", username: "alexa", gender: "female", singles_elo: 1000, doubles_elo: 1200 },
    ],
  });

  const result = await searchUsers("al", undefined, { discipline: "doubles" }, supabaseMock);

  assert.equal(result.results.length, 2);
  assert.deepEqual(
    result.results.map((user) => ({ auth_id: user.auth_id, doubles_elo: user.doubles_elo })),
    [
      { auth_id: "a", doubles_elo: 1300 },
      { auth_id: "b", doubles_elo: 1200 },
    ]
  );
});

test("searchUsers validates discipline", async () => {
  const supabaseMock = new SupabaseMock({ users: [] });

  const result = await searchUsers("al", undefined, { discipline: "triples" }, supabaseMock);

  assert.deepEqual(result, { error: "Invalid discipline" });
});
