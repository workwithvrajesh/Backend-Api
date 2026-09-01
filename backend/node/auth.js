import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: "12h" },
  );
}

export function bearer(req) {
  const header = req.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export function verifyToken(token) {
  if (!token || !config.jwtSecret) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export function claimsFor(req) {
  return verifyToken(bearer(req));
}

export function hasServiceKey(req) {
  const key = req.get("x-service-key") || "";
  return Boolean(config.serviceKey) && key === config.serviceKey;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Admin-only routes: a valid login token is required.
export function requireAdmin(req) {
  const claims = claimsFor(req);
  if (!claims) throw new HttpError(401, "Unauthorized");
  return claims;
}

// Public writes from the website backend: either the shared service key or an
// admin token is accepted.
export function requireServiceOrAdmin(req) {
  if (hasServiceKey(req)) return { sub: null, role: "service" };
  return requireAdmin(req);
}
