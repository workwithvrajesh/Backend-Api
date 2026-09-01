// One-time setup: create or reset the admin user.
//   node create-admin.js workwithvrajesh@gmail.com 'Admin@Vrajesh123'
import bcrypt from "bcryptjs";
import { close, run, uuid } from "./db.js";

const email = (process.argv[2] || "workwithvrajesh@gmail.com").trim().toLowerCase();
const password = process.argv[3] || "Admin@Vrajesh123";

const hash = await bcrypt.hash(password, 12);
await run(
  `INSERT INTO admin_users (id, email, password_hash, role, created_at)
   VALUES (?, ?, ?, 'admin', datetime('now'))
   ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin'`,
  [uuid(), email, hash],
);

console.log(`Admin ready: ${email}`);
await close();
