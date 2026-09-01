import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const cwd = path.join(os.tmpdir(), "wwv-wrangler-cwd");
fs.mkdirSync(cwd, { recursive: true });

const env = { ...process.env };
delete env.CLOUDFLARE_API_TOKEN;

const wranglerBin = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");

const result = spawnSync(
  process.execPath,
  [wranglerBin, "deploy", "--config", path.join(root, "wrangler.toml")],
  { cwd, env, stdio: "inherit", shell: false },
);

process.exit(result.status ?? 1);
