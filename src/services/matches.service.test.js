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
  }

  from(table) {
    return new QueryBuilder(this, table);
  }
}

test("confirmMatch records elo history once per player", async () => {
  const playedAt = "2024-01-01T00:00:00.000Z";
  const supabaseMock = new SupabaseMock({
    matches: [
      {
        match_id: "match-1",
        match_type: "singles",
        status: "pending",
        needs_confirmation_from_list: ["user-confirm"],
        played_at: playedAt,
      },
    ],
    match_players: [
      { match_id: "match-1", auth_id: "player-a", team: "A", is_winner: true },
      { match_id: "match-1", auth_id: "player-b", team: "B", is_winner: false },
    ],
    users: [
      { auth_id: "player-a", elo: 1000 },
      { auth_id: "player-b", elo: 1000 },
    ],
    elo_history: [],
  });

  const firstResult = await confirmMatch("match-1", "user-confirm", supabaseMock);

  assert.equal(firstResult.status, "confirmed");
  assert.equal(supabaseMock.tables.elo_history.length, 2);

  const playerAHistory = supabaseMock.tables.elo_history.find((row) => row.auth_id === "player-a");
  const playerBHistory = supabaseMock.tables.elo_history.find((row) => row.auth_id === "player-b");

  assert.equal(playerAHistory.old_elo, 1000);
  assert.equal(playerAHistory.created_at, playedAt);
  assert.equal(playerBHistory.old_elo, 1000);
  assert.equal(playerBHistory.created_at, playedAt);

  await assert.rejects(() => confirmMatch("match-1", "user-confirm", supabaseMock));

  assert.equal(supabaseMock.tables.elo_history.length, 2);
});
