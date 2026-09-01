import { d1 } from "./config.js";

const IDENT = /^[a-z_][a-z0-9_]*$/i;

export function quoteIdent(name) {
  if (!IDENT.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return `"${name}"`;
}

function normalize(value) {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Turn mysql2-style named placeholders (`:id`) into D1 positional `?` params. */
function bind(sql, params = []) {
  if (Array.isArray(params)) {
    return { sql, params: params.map(normalize) };
  }
  if (!params || typeof params !== "object") {
    return { sql, params: [] };
  }
  const values = [];
  const bound = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (!(name in params)) throw new Error(`Missing query param :${name}`);
    values.push(normalize(params[name]));
    return "?";
  });
  return { sql: bound, params: values };
}

function workerDb() {
  return globalThis.__WWV_D1 ?? null;
}

function prepared(db, bound) {
  const stmt = db.prepare(bound.sql);
  return bound.params.length ? stmt.bind(...bound.params) : stmt;
}

async function d1Request(body) {
  if (!d1.accountId || !d1.databaseId || !d1.apiToken) {
    throw new Error("Cloudflare D1 is not configured");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${d1.accountId}/d1/database/${d1.databaseId}/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${d1.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const detail =
      payload?.errors?.map((error) => error.message).join("; ") ||
      payload?.messages?.map((message) => message.message).join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`D1 query failed: ${detail}`);
  }
  return payload.result ?? [];
}

export async function exec(sql, params = []) {
  const bound = bind(sql, params);
  const db = workerDb();
  if (db) {
    const result = await prepared(db, bound).all();
    return {
      rows: result.results ?? [],
      meta: result.meta ?? {},
      affectedRows: result.meta?.changes ?? 0,
    };
  }
  const [result] = await d1Request(bound);
  if (!result?.success) {
    throw new Error(result?.error || "D1 statement failed");
  }
  return {
    rows: result.results ?? [],
    meta: result.meta ?? {},
    affectedRows: result.meta?.changes ?? 0,
  };
}

export async function query(sql, params = []) {
  const { rows } = await exec(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function run(sql, params = []) {
  return exec(sql, params);
}

export async function batch(statements) {
  if (!statements.length) return [];
  const db = workerDb();
  if (db) {
    return db.batch(
      statements.map(({ sql, params }) => prepared(db, bind(sql, params ?? []))),
    );
  }
  const results = await d1Request({
    batch: statements.map(({ sql, params }) => bind(sql, params ?? [])),
  });
  return results;
}

const columnCache = new Map();

export async function columns(table) {
  if (!columnCache.has(table)) {
    const rows = await query(`PRAGMA table_info(${quoteIdent(table)})`);
    columnCache.set(
      table,
      rows.map((row) => row.name),
    );
  }
  return columnCache.get(table);
}

export function uuid() {
  return crypto.randomUUID();
}

export function jsonCol(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function close() {
  /* Local Node uses the HTTP D1 API; Workers use the bound DB. */
}

export const pool = { end: close };
