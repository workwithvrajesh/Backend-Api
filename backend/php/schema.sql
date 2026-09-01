-- Work With Vrajesh — MySQL schema (import via phpMyAdmin into u970664856_wwv)
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cms_documents (
  `key` VARCHAR(160) NOT NULL PRIMARY KEY,
  data JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cms_collections (
  id CHAR(36) NOT NULL PRIMARY KEY,
  collection VARCHAR(160) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  data JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36) NULL,
  UNIQUE KEY uniq_collection_slug (collection, slug),
  KEY idx_collection_sort (collection, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS media_assets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  path VARCHAR(500) NOT NULL,
  url VARCHAR(500) NOT NULL,
  alt VARCHAR(500) NOT NULL DEFAULT '',
  width INT NULL,
  height INT NULL,
  size_bytes BIGINT NULL,
  mime VARCHAR(120) NULL,
  original_path VARCHAR(500) NULL,
  original_url VARCHAR(500) NULL,
  original_size_bytes BIGINT NULL,
  original_width INT NULL,
  original_height INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inquiries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(60) NOT NULL DEFAULT '',
  service VARCHAR(160) NOT NULL DEFAULT '',
  message TEXT NULL,
  attachment_name VARCHAR(300) NULL,
  attachments JSON NULL,
  attribution JSON NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'website',
  status VARCHAR(40) NOT NULL DEFAULT 'new',
  email_status VARCHAR(40) NULL,
  email_detail TEXT NULL,
  email_attempts INT NOT NULL DEFAULT 0,
  email_updated_at DATETIME NULL,
  email_delivery JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inquiry_audit_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  outcome VARCHAR(40) NOT NULL,
  reason VARCHAR(200) NULL,
  captcha_result VARCHAR(60) NULL,
  rate_limit_result VARCHAR(60) NULL,
  retry_after_minutes INT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'website',
  name VARCHAR(200) NULL,
  email VARCHAR(255) NULL,
  service VARCHAR(160) NULL,
  attachment_name VARCHAR(300) NULL,
  elapsed_seconds DECIMAL(10,3) NULL,
  ip_hash VARCHAR(128) NULL,
  user_agent VARCHAR(400) NULL,
  detail TEXT NULL,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inquiry_rate_limits (
  id CHAR(36) NOT NULL PRIMARY KEY,
  ip_hash VARCHAR(128) NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'website',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rate (ip_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS smtp_settings (
  id TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  host VARCHAR(200) NULL,
  port INT NULL,
  security VARCHAR(20) NULL,
  username VARCHAR(200) NULL,
  password TEXT NULL,
  from_email VARCHAR(255) NULL,
  from_name VARCHAR(200) NULL,
  reply_to VARCHAR(255) NULL,
  notify_email VARCHAR(255) NULL,
  last_test_at DATETIME NULL,
  last_test_ok TINYINT(1) NULL,
  last_test_detail TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ga_event_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(120) NOT NULL,
  page_path VARCHAR(400) NULL,
  params JSON NULL,
  measurement_id VARCHAR(60) NULL,
  tracking_enabled TINYINT(1) NOT NULL DEFAULT 0,
  delivered TINYINT(1) NOT NULL DEFAULT 0,
  note TEXT NULL,
  KEY idx_ga_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seo_audit_runs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  origin VARCHAR(300) NULL,
  `trigger` VARCHAR(60) NULL,
  error_count INT NOT NULL DEFAULT 0,
  warn_count INT NOT NULL DEFAULT 0,
  pass_count INT NOT NULL DEFAULT 0,
  sitemap_url_count INT NOT NULL DEFAULT 0,
  robots_hash VARCHAR(128) NULL,
  sitemap_hash VARCHAR(128) NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  report JSON NULL,
  KEY idx_seo_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
