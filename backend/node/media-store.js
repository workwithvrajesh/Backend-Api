import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export function kvStore() {
  return globalThis.__WWV_KV ?? null;
}

export function publicUploadUrl(rel) {
  return `${config.uploadUrl}/${rel.replace(/^\/+/, "")}`;
}

export async function saveUpload(rel, file) {
  const mime = file.mimetype || "application/octet-stream";
  const kv = kvStore();
  if (kv) {
    const body = file.buffer;
    if (!body) throw new Error("Upload is missing file bytes");
    await kv.put(rel, body, { metadata: { mime } });
    return;
  }
  const dest = path.join(config.uploadDir, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (file.path) await fs.rename(file.path, dest);
  else if (file.buffer) await fs.writeFile(dest, file.buffer);
  else throw new Error("Upload is missing file bytes");
}

export async function deleteUpload(rel) {
  if (!rel || rel.includes("..")) return;
  const kv = kvStore();
  if (kv) {
    await kv.delete(rel);
    return;
  }
  const abs = path.resolve(config.uploadDir, rel);
  if (abs.startsWith(config.uploadDir)) await fs.rm(abs, { force: true });
}

export async function readUpload(rel) {
  if (!rel || rel.includes("..")) return null;
  const kv = kvStore();
  if (kv) {
    const object = await kv.getWithMetadata(rel, { type: "arrayBuffer" });
    if (!object?.value) return null;
    return {
      bytes: Buffer.from(object.value),
      mime: object.metadata?.mime || "application/octet-stream",
    };
  }
  const abs = path.resolve(config.uploadDir, rel);
  if (!abs.startsWith(config.uploadDir)) return null;
  try {
    const bytes = await fs.readFile(abs);
    return { bytes, mime: undefined };
  } catch {
    return null;
  }
}

export async function discardTemp(file) {
  if (file?.path) await fs.rm(file.path, { force: true });
}
