import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nodeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(nodeRoot, "..", "..");
const candidates = [
  path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
  path.join(nodeRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
];
const wranglerJs = candidates.find((file) => fs.existsSync(file));
if (!wranglerJs) {
  console.error("wrangler is not installed. Run npm install from the repo root.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [wranglerJs, "deploy", "--config", path.join(repoRoot, "wrangler.toml")],
  { cwd: repoRoot, stdio: "inherit", shell: false },
);

process.exit(result.status ?? 1);
