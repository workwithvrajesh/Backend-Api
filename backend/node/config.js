try {
  await import("dotenv/config");
} catch {
  /* Cloudflare Workers has no local .env file */
}
import path from "node:path";

const int = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const d1 = {
  get accountId() {
    return process.env.CLOUDFLARE_ACCOUNT_ID || "";
  },
  get databaseId() {
    return process.env.CLOUDFLARE_D1_DATABASE_ID || "";
  },
  get databaseName() {
    return process.env.CLOUDFLARE_D1_DATABASE_NAME || "workwithvrajesh-db";
  },
  get apiToken() {
    return process.env.CLOUDFLARE_API_TOKEN || "";
  },
};

export const config = {
  get port() {
    return int(process.env.PORT, 8787);
  },
  get jwtSecret() {
    return process.env.JWT_SECRET || "";
  },
  get serviceKey() {
    return process.env.SERVICE_KEY || "";
  },
  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  get uploadDir() {
    return path.resolve(process.env.UPLOAD_DIR || "./uploads");
  },
  get uploadUrl() {
    return (process.env.UPLOAD_URL || "/uploads").replace(/\/+$/, "");
  },
  maxUploadBytes: 10 * 1024 * 1024,
  allowedMime: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
    "application/pdf",
  ],
};

if (!d1.accountId || !d1.databaseId || !d1.apiToken) {
  console.warn("[wwv-api] Cloudflare D1 credentials are missing — queries will fail.");
}

if (!config.jwtSecret || config.jwtSecret === "change-me-to-a-long-random-string") {
  console.warn("[wwv-api] JWT_SECRET is not set — admin logins will be rejected.");
}
