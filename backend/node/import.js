// Imports schema.sql (and optionally the MySQL data dump) into Cloudflare D1.
//   node import.js            -> schema + data
//   node import.js schema     -> schema only
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { batch, close } from "./db.js";

const mode = process.argv[2] || "all";
const here = path.dirname(fileURLToPath(import.meta.url));

function mysqlToSqlite(sql) {
  return sql
    .replace(/^\s*SET\s+[^;]+;/gim, "")
    .replace(/INSERT IGNORE INTO/gi, "INSERT OR IGNORE INTO")
    .replace(/`([^`]+)`/g, (_, ident) => (ident === "key" || ident === "trigger" ? `"${ident}"` : ident));
}

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];
    if (inString) {
      current += char;
      if (char === quote && sql[i - 1] !== "\\") inString = false;
      continue;
    }
    if (char === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      current += "\n";
      continue;
    }
    if (char === "'" || char === '"') {
      inString = true;
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

async function readSql(file) {
  const candidates = [
    path.join(here, file),
    path.resolve(here, "../d1", file),
    path.resolve(here, "../php", file),
  ];
  for (const candidate of candidates) {
    try {
      const sql = await fs.readFile(candidate, "utf8");
      return { sql, candidate };
    } catch {
      /* try next path */
    }
  }
  return null;
}

const files = mode === "schema" ? ["schema.sql"] : ["schema.sql", "data.sql"];

for (const file of files) {
  const loaded = await readSql(file);
  if (!loaded) {
    console.warn(`Skipped ${file} — not found`);
    continue;
  }
  console.log(`Running ${loaded.candidate}`);
  const sqlite = file === "data.sql" ? mysqlToSqlite(loaded.sql) : loaded.sql;
  const statements = splitStatements(sqlite).map((sql) => ({ sql, params: [] }));
  const chunkSize = 15;
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    await batch(chunk);
    process.stdout.write(`  ${Math.min(i + chunk.length, statements.length)}/${statements.length}\r`);
  }
  console.log(`  ${statements.length}/${statements.length} statements`);
}

console.log("Import complete.");
await close();
