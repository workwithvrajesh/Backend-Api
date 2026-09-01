-- Work With Vrajesh — Cloudflare D1 (SQLite) schema
-- Database: workwithvrajesh-db

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cms_documents (
  "key" TEXT PRIMARY KEY,
  data TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS cms_collections (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  UNIQUE (collection, slug)
);

CREATE INDEX IF NOT EXISTS idx_collection_sort ON cms_collections (collection, sort);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  mime TEXT,
  original_path TEXT,
  original_url TEXT,
  original_size_bytes INTEGER,
  original_width INTEGER,
  original_height INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  message TEXT,
  attachment_name TEXT,
  attachments TEXT,
  attribution TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'new',
  email_status TEXT,
  email_detail TEXT,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_updated_at TEXT,
  email_delivery TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries (created_at);

CREATE TABLE IF NOT EXISTS inquiry_audit_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  outcome TEXT NOT NULL,
  reason TEXT,
  captcha_result TEXT,
  rate_limit_result TEXT,
  retry_after_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'website',
  name TEXT,
  email TEXT,
  service TEXT,
  attachment_name TEXT,
  elapsed_seconds REAL,
  ip_hash TEXT,
  user_agent TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON inquiry_audit_log (created_at);

CREATE TABLE IF NOT EXISTS inquiry_rate_limits (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'website',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rate ON inquiry_rate_limits (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS smtp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  host TEXT,
  port INTEGER,
  security TEXT,
  username TEXT,
  password TEXT,
  from_email TEXT,
  from_name TEXT,
  reply_to TEXT,
  notify_email TEXT,
  last_test_at TEXT,
  last_test_ok INTEGER,
  last_test_detail TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS ga_event_log (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name TEXT NOT NULL,
  page_path TEXT,
  params TEXT,
  measurement_id TEXT,
  tracking_enabled INTEGER NOT NULL DEFAULT 0,
  delivered INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_ga_created ON ga_event_log (created_at);

CREATE TABLE IF NOT EXISTS seo_audit_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  origin TEXT,
  "trigger" TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  warn_count INTEGER NOT NULL DEFAULT 0,
  pass_count INTEGER NOT NULL DEFAULT 0,
  sitemap_url_count INTEGER NOT NULL DEFAULT 0,
  robots_hash TEXT,
  sitemap_hash TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  report TEXT
);

CREATE INDEX IF NOT EXISTS idx_seo_created ON seo_audit_runs (created_at);
