import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { close, query, one, run, columns, uuid, jsonCol, quoteIdent } from "./db.js";
import { saveUpload, deleteUpload, readUpload, discardTemp, publicUploadUrl } from "./media-store.js";
import {
  HttpError,
  issueToken,
  bearer,
  verifyToken,
  claimsFor,
  requireAdmin,
  requireServiceOrAdmin,
} from "./auth.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin(origin, callback) {
      const allowed = config.allowedOrigins;
      if (!allowed.length || !origin) return callback(null, true);
      return callback(null, allowed.includes(origin));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-service-key"],
    maxAge: 86400,
  }),
);

const runningOnWorker =
  typeof caches !== "undefined" && typeof caches.default !== "undefined";

const upload = multer(
  runningOnWorker
    ? { storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } }
    : {
        dest: path.join(config.uploadDir, ".tmp"),
        limits: { fileSize: config.maxUploadBytes },
      },
);

// `next` must be forwarded: the log-table routes call it to fall through to
// the 404 handler when the path is not one of theirs.
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// ---- output shaping ------------------------------------------------------

const docOut = (row) => ({ ...row, data: jsonCol(row.data) ?? {} });
const itemOut = (row) => ({ ...row, data: jsonCol(row.data) ?? {}, sort: Number(row.sort) || 0 });

const mediaOut = (row) => {
  const out = { ...row };
  for (const key of [
    "width",
    "height",
    "size_bytes",
    "original_width",
    "original_height",
    "original_size_bytes",
  ]) {
    if (key in out) out[key] = out[key] === null ? null : Number(out[key]);
  }
  return out;
};

const inquiryOut = (row) => ({
  ...row,
  attachments: jsonCol(row.attachments),
  attribution: jsonCol(row.attribution),
  email_delivery: jsonCol(row.email_delivery),
  email_attempts: Number(row.email_attempts) || 0,
});

const BOOL_FLAGS = ["tracking_enabled", "delivered", "acknowledged", "enabled", "last_test_ok"];

const genericOut = (row) => {
  const out = { ...row };
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
      const decoded = jsonCol(value);
      if (decoded !== null) out[key] = decoded;
    }
  }
  for (const flag of BOOL_FLAGS) {
    if (flag in out && out[flag] !== null) out[flag] = Boolean(out[flag]);
  }
  return out;
};

const asJson = (value) => (value === undefined ? null : JSON.stringify(value ?? {}));

// ---- health --------------------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "wwv-api",
    database: process.env.CLOUDFLARE_D1_DATABASE_NAME || "workwithvrajesh-db",
    health: "/health",
    hint: "This is the D1 API. Open the website from vrajesh-connect-grow (npm start), usually http://localhost:8080",
  });
});

app.get(
  "/health",
  wrap(async (_req, res) => {
    await query("SELECT 1");
    res.json({ ok: true, time: new Date().toISOString() });
  }),
);

// ---- auth ----------------------------------------------------------------

app.post(
  "/auth/login",
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const user = await one("SELECT * FROM admin_users WHERE email = ? LIMIT 1", [email]);
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      throw new HttpError(401, "Invalid email or password");
    }
    if (!config.jwtSecret) {
      throw new HttpError(500, "Server is missing JWT_SECRET");
    }
    res.json({
      token: issueToken(user),
      user: { id: user.id, email: user.email, role: user.role },
    });
  }),
);

app.get(
  "/auth/me",
  wrap(async (req, res) => {
    const claims = requireAdmin(req);
    res.json({ user: { id: claims.sub, email: claims.email, role: claims.role } });
  }),
);

// ---- CMS snapshot (public site + admin preview) --------------------------

app.get(
  "/cms/snapshot",
  wrap(async (req, res) => {
    const onlyPublished = !verifyToken(bearer(req));
    const filter = onlyPublished ? " WHERE status = 'published'" : "";
    const [docs, items] = await Promise.all([
      query(`SELECT * FROM cms_documents${filter}`),
      query(`SELECT * FROM cms_collections${filter} ORDER BY collection ASC, sort ASC, created_at ASC`),
    ]);
    res.json({
      documents: docs.map(docOut),
      collections: items.map(itemOut),
    });
  }),
);

// ---- CMS documents -------------------------------------------------------

app.get(
  "/cms/documents/:key",
  wrap(async (req, res) => {
    const onlyPublished = !verifyToken(bearer(req));
    const row = await one(
      `SELECT * FROM cms_documents WHERE "key" = ?${onlyPublished ? " AND status = 'published'" : ""} LIMIT 1`,
      [req.params.key],
    );
    res.json(row ? docOut(row) : null);
  }),
);

const saveDocument = wrap(async (req, res) => {
  const claims = requireAdmin(req);
  const key = String(req.body?.key ?? req.params.key ?? "");
  if (!key) throw new HttpError(400, "key is required");
  await run(
    `INSERT INTO cms_documents ("key", data, status, updated_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT("key") DO UPDATE SET
       data = excluded.data,
       status = excluded.status,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
    [key, asJson(req.body?.data), String(req.body?.status ?? "draft"), claims.sub],
  );
  res.json({ ok: true });
});

app.post("/cms/documents", saveDocument);
app.post("/cms/documents/:key", saveDocument);

// ---- CMS collections -----------------------------------------------------

app.get(
  "/cms/collections/:collection",
  wrap(async (req, res) => {
    const onlyPublished = !verifyToken(bearer(req));
    const rows = await query(
      `SELECT * FROM cms_collections WHERE collection = ?${onlyPublished ? " AND status = 'published'" : ""}
       ORDER BY sort ASC, created_at ASC`,
      [req.params.collection],
    );
    res.json(rows.map(itemOut));
  }),
);

app.post(
  "/cms/collections/:collection",
  wrap(async (req, res) => {
    const claims = requireAdmin(req);
    const rows = Array.isArray(req.body?.items) ? req.body.items : [req.body];
    for (const row of rows) {
      await run(
        `INSERT INTO cms_collections (id, collection, slug, sort, status, data, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(collection, slug) DO UPDATE SET
           sort = excluded.sort,
           status = excluded.status,
           data = excluded.data,
           updated_by = excluded.updated_by,
           updated_at = datetime('now')`,
        [
          row?.id ? String(row.id) : uuid(),
          String(row?.collection ?? req.params.collection),
          String(row?.slug ?? ""),
          Number.parseInt(String(row?.sort ?? 0), 10) || 0,
          String(row?.status ?? "draft"),
          asJson(row?.data),
          claims.sub,
        ],
      );
    }
    res.json({ ok: true, count: rows.length });
  }),
);

app.patch(
  "/cms/collections/:collection/:id",
  wrap(async (req, res) => {
    const claims = requireAdmin(req);
    const sets = [];
    const args = [];
    for (const field of ["slug", "sort", "status"]) {
      if (field in (req.body ?? {})) {
        sets.push(`${field} = ?`);
        args.push(field === "sort" ? Number.parseInt(String(req.body[field]), 10) || 0 : String(req.body[field]));
      }
    }
    if ("data" in (req.body ?? {})) {
      sets.push("data = ?");
      args.push(asJson(req.body.data));
    }
    if (!sets.length) throw new HttpError(400, "Nothing to update");
    sets.push("updated_by = ?", "updated_at = datetime('now')");
    args.push(claims.sub, req.params.id);
    await run(`UPDATE cms_collections SET ${sets.join(", ")} WHERE id = ?`, args);
    res.json({ ok: true });
  }),
);

app.delete(
  "/cms/collections/:collection/:id",
  wrap(async (req, res) => {
    requireAdmin(req);
    await run("DELETE FROM cms_collections WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  }),
);

// ---- media ---------------------------------------------------------------

app.get(
  "/media",
  wrap(async (req, res) => {
    requireAdmin(req);
    const rows = await query("SELECT * FROM media_assets ORDER BY created_at DESC");
    res.json(rows.map(mediaOut));
  }),
);

app.post(
  "/media",
  upload.single("file"),
  wrap(async (req, res) => {
    requireAdmin(req);
    if (!req.file) throw new HttpError(400, "file is required");
    if (!config.allowedMime.includes(req.file.mimetype)) {
      await discardTemp(req.file);
      throw new HttpError(400, `Unsupported file type: ${req.file.mimetype}`);
    }
    const safe = req.file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
    const rel = `${new Date().getFullYear()}/${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${safe}`;
    await saveUpload(rel, req.file);

    const row = {
      id: uuid(),
      path: rel,
      url: publicUploadUrl(rel),
      alt: "",
      width: null,
      height: null,
      size_bytes: req.file.size,
      mime: req.file.mimetype,
    };
    await run(
      `INSERT INTO media_assets (id, path, url, alt, width, height, size_bytes, mime,
         original_path, original_url, original_size_bytes, original_width, original_height)
       VALUES (:id, :path, :url, :alt, :width, :height, :size_bytes, :mime,
         :path, :url, :size_bytes, :width, :height)`,
      row,
    );
    res.json(mediaOut({ ...row, created_at: new Date().toISOString() }));
  }),
);

app.patch(
  "/media/:id",
  wrap(async (req, res) => {
    requireAdmin(req);
    await run("UPDATE media_assets SET alt = ? WHERE id = ?", [
      String(req.body?.alt ?? ""),
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);

app.delete(
  "/media/:id",
  wrap(async (req, res) => {
    requireAdmin(req);
    const row = await one("SELECT path, original_path FROM media_assets WHERE id = ? LIMIT 1", [
      req.params.id,
    ]);
    const paths = [...new Set([row?.path, row?.original_path].filter(Boolean))];
    for (const rel of paths) await deleteUpload(rel);
    await run("DELETE FROM media_assets WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  }),
);

// ---- inquiries -----------------------------------------------------------

app.post(
  "/inquiries",
  wrap(async (req, res) => {
    requireServiceOrAdmin(req);
    const body = req.body ?? {};
    const row = {
      id: uuid(),
      name: String(body.name ?? "").trim(),
      email: String(body.email ?? "").trim(),
      phone: String(body.phone ?? "").trim(),
      service: String(body.service ?? "").trim(),
      message: String(body.message ?? ""),
      attachment_name: body.attachment_name ?? null,
      attachments: body.attachments ? JSON.stringify(body.attachments) : null,
      attribution: body.attribution ? JSON.stringify(body.attribution) : null,
      source: String(body.source ?? "website"),
      status: String(body.status ?? "new"),
    };
    if (!row.name || !row.email) throw new HttpError(400, "name and email are required");
    await run(
      `INSERT INTO inquiries (id, name, email, phone, service, message, attachment_name,
         attachments, attribution, source, status)
       VALUES (:id, :name, :email, :phone, :service, :message, :attachment_name,
         :attachments, :attribution, :source, :status)`,
      row,
    );
    res.status(201).json({ ok: true, id: row.id });
  }),
);

app.get(
  "/inquiries",
  wrap(async (req, res) => {
    requireAdmin(req);
    const rows = await query("SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 500");
    res.json(rows.map(inquiryOut));
  }),
);

app.post(
  "/inquiries/attachments",
  upload.single("file"),
  wrap(async (req, res) => {
    requireServiceOrAdmin(req);
    if (!req.file) throw new HttpError(400, "file is required");
    const safe = req.file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
    const rel = `attachments/${new Date().getFullYear()}/${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${safe}`;
    await saveUpload(rel, req.file);
    res.status(201).json({ path: rel, url: publicUploadUrl(rel) });
  }),
);

app.get(
  /^\/inquiries\/attachments\/(.+)$/,
  wrap(async (req, res) => {
    requireAdmin(req);
    const rel = decodeURIComponent(req.params[0] || "").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) throw new HttpError(404, "Not found");
    const file = await readUpload(rel);
    if (!file) throw new HttpError(404, "Not found");
    if (file.mime) res.type(file.mime);
    res.send(file.bytes);
  }),
);

app.patch(
  "/inquiries/:id",
  wrap(async (req, res) => {
    requireServiceOrAdmin(req);
    const body = req.body ?? {};
    const sets = [];
    const args = [];
    for (const field of ["status", "email_status", "email_detail", "email_updated_at"]) {
      if (field in body) {
        sets.push(`${field} = ?`);
        args.push(body[field] == null ? null : String(body[field]));
      }
    }
    if ("email_attempts" in body) {
      sets.push("email_attempts = ?");
      args.push(Number.parseInt(String(body.email_attempts), 10) || 0);
    }
    if ("email_delivery" in body) {
      sets.push("email_delivery = ?");
      args.push(asJson(body.email_delivery));
    }
    if (!sets.length) {
      sets.push("status = ?");
      args.push(String(body.status ?? "new"));
    }
    sets.push("updated_at = datetime('now')");
    args.push(req.params.id);
    await run(`UPDATE inquiries SET ${sets.join(", ")} WHERE id = ?`, args);
    res.json({ ok: true });
  }),
);

app.delete(
  "/inquiries/:id",
  wrap(async (req, res) => {
    requireAdmin(req);
    await run("DELETE FROM inquiries WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  }),
);

// ---- generic admin log tables -------------------------------------------

const LOG_TABLES = {
  "inquiry-audit": "inquiry_audit_log",
  "inquiry-rate-limits": "inquiry_rate_limits",
  "ga-events": "ga_event_log",
  "seo-audit-runs": "seo_audit_runs",
};

const logTable = (req) => {
  const table = LOG_TABLES[req.params.resource];
  if (!table) throw new HttpError(404, "Not found");
  return table;
};

app.get(
  "/inquiry-rate-limits",
  wrap(async (req, res) => {
    requireServiceOrAdmin(req);
    const ipHash = String(req.query.ip_hash ?? "");
    const since = String(req.query.since ?? "");
    const where = [];
    const args = [];
    if (ipHash) {
      where.push("ip_hash = ?");
      args.push(ipHash);
    }
    if (since) {
      where.push("created_at >= ?");
      args.push(since);
    }
    const sql = `SELECT * FROM inquiry_rate_limits${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC LIMIT 500`;
    res.json(await query(sql, args));
  }),
);

app.patch(
  "/seo-audit-runs/:id",
  wrap(async (req, res) => {
    requireAdmin(req);
    await run(`UPDATE seo_audit_runs SET acknowledged = ? WHERE id = ?`, [
      req.body?.acknowledged ? 1 : 0,
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);

app.get(
  "/:resource",
  wrap(async (req, res, next) => {
    if (!LOG_TABLES[req.params.resource]) return next();
    requireServiceOrAdmin(req);
    const rows = await query(
      `SELECT * FROM ${quoteIdent(logTable(req))} ORDER BY created_at DESC LIMIT 500`,
    );
    res.json(rows.map(genericOut));
  }),
);

app.post(
  "/:resource",
  wrap(async (req, res, next) => {
    if (!LOG_TABLES[req.params.resource]) return next();
    requireServiceOrAdmin(req);
    const table = logTable(req);
    const body = { id: uuid(), ...(req.body ?? {}) };
    const allowed = await columns(table);
    const insert = {};
    for (const [key, value] of Object.entries(body)) {
      if (!allowed.includes(key)) continue;
      insert[key] = Array.isArray(value) || (value && typeof value === "object")
        ? JSON.stringify(value)
        : typeof value === "boolean"
          ? Number(value)
          : value;
    }
    const names = Object.keys(insert).map((c) => quoteIdent(c)).join(", ");
    const holders = Object.keys(insert).map((c) => `:${c}`).join(", ");
    await run(`INSERT INTO ${quoteIdent(table)} (${names}) VALUES (${holders})`, insert);
    res.status(201).json({ ok: true, id: insert.id });
  }),
);

const deleteLogRows = wrap(async (req, res, next) => {
  if (!LOG_TABLES[req.params.resource]) return next();
  requireServiceOrAdmin(req);
  const table = logTable(req);
  if (req.params.id) {
    await run(`DELETE FROM ${quoteIdent(table)} WHERE id = ?`, [req.params.id]);
    return res.json({ ok: true });
  }
  const before = String(req.query.before ?? "");
  if (!before) throw new HttpError(400, "before (ISO date) or an id is required");
  const cutoff = new Date(before);
  if (Number.isNaN(cutoff.getTime())) throw new HttpError(400, "before must be an ISO date");
  const result = await run(`DELETE FROM ${quoteIdent(table)} WHERE created_at < ?`, [
    cutoff.toISOString().slice(0, 19).replace("T", " "),
  ]);
  res.json({ ok: true, deleted: result.affectedRows });
});

app.delete("/:resource", deleteLogRows);
app.delete("/:resource/:id", deleteLogRows);

// ---- SMTP settings -------------------------------------------------------

app.get(
  "/smtp",
  wrap(async (req, res) => {
    requireServiceOrAdmin(req);
    const row = await one("SELECT * FROM smtp_settings WHERE id = 1 LIMIT 1");
    res.json(row ? genericOut(row) : null);
  }),
);

app.post(
  "/smtp",
  wrap(async (req, res) => {
    const claims = requireServiceOrAdmin(req);
    const allowed = (await columns("smtp_settings")).filter(
      (c) => !["id", "updated_at"].includes(c),
    );
    const insert = { id: 1, updated_by: claims.sub ?? "service" };
    for (const column of allowed) {
      if (!(column in (req.body ?? {}))) continue;
      const value = req.body[column];
      insert[column] =
        typeof value === "boolean"
          ? Number(value)
          : value && typeof value === "object"
            ? JSON.stringify(value)
            : value;
    }
    const keys = Object.keys(insert);
    await run(
      `INSERT INTO smtp_settings (${keys.map((c) => quoteIdent(c)).join(", ")}, updated_at)
       VALUES (${keys.map((c) => `:${c}`).join(", ")}, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET ${keys
         .filter((c) => c !== "id")
         .map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`)
         .join(", ")}, updated_at = datetime('now')`,
      insert,
    );
    res.json({ ok: true });
  }),
);

// ---- uploads + errors ----------------------------------------------------

app.get(
  /^\/uploads\/(.+)$/,
  wrap(async (req, res) => {
    const rel = decodeURIComponent(req.params[0] || "").replace(/^\/+/, "");
    const file = await readUpload(rel);
    if (!file) throw new HttpError(404, "Not found");
    res.set("Cache-Control", "public, max-age=2592000, immutable");
    if (file.mime) res.type(file.mime);
    res.send(file.bytes);
  }),
);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File is larger than 10MB" });
  }
  console.error("[wwv-api]", error);
  res.status(500).json({ error: "Server error" });
});

const server = app.listen(config.port, () => {
  console.log(
    `[wwv-api] listening on :${config.port} (D1 ${process.env.CLOUDFLARE_D1_DATABASE_NAME ?? "workwithvrajesh-db"})`,
  );
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => close().then(() => process.exit(0)));
  });
}

let workerExport = {
  fetch() {
    return new Response("This module is a Node server. Deploy with wrangler.", { status: 500 });
  },
};

try {
  const { httpServerHandler } = await import("cloudflare:node");
  const handler = httpServerHandler({ port: config.port });
  workerExport = {
    async fetch(request, env, ctx) {
      if (env && typeof env === "object") {
        for (const [key, value] of Object.entries(env)) {
          if (typeof value === "string") process.env[key] = value;
        }
        if (env.MEDIA_KV) globalThis.__WWV_KV = env.MEDIA_KV;
        if (env.DB) globalThis.__WWV_D1 = env.DB;
      }
      return handler.fetch(request, env, ctx);
    },
  };
} catch {
  // Local Node (`npm start`) — Express is already listening above.
}

export default workerExport;
