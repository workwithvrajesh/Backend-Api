# Work With Vrajesh — Node.js + Cloudflare D1 API

Node/Express REST API backed by Cloudflare D1 (`workwithvrajesh-db`). Same
endpoints as the PHP kit — pick one, not both.

## 1. Configure the connection

`backend/node/.env`:

```
CLOUDFLARE_ACCOUNT_ID=7712e75c497be262dad6a07f2378e10d
CLOUDFLARE_D1_DATABASE_ID=3d54fc00-0b85-4b29-a63c-a3527785ba92
CLOUDFLARE_D1_DATABASE_NAME=workwithvrajesh-db
CLOUDFLARE_API_TOKEN=your-token
```

Then set `JWT_SECRET` and `SERVICE_KEY` to long random values:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Wrangler config lives at the repo root (`wrangler.toml`) with the D1 binding
name `DB`.

## 2. Install, import, run

```bash
cd backend/node
npm install
npm run import-schema -- schema   # creates all 10 tables in D1
npm run create-admin workwithvrajesh@gmail.com 'Admin@Vrajesh123'
npm start                         # listens on PORT (default 8787)
```

`npm run import-schema` (no extra argument) also loads `backend/php/data.sql`.

Verify:

```bash
curl http://localhost:8787/health
# {"ok":true,"time":"..."}
```

## 3. Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | public |
| POST | `/auth/login` | public |
| GET | `/auth/me` | admin token |
| GET | `/cms/documents/:key` | public (published only) / admin (drafts too) |
| POST | `/cms/documents/:key` | admin |
| GET | `/cms/collections/:collection` | public (published only) / admin |
| POST | `/cms/collections/:collection` | admin |
| PATCH / DELETE | `/cms/collections/:collection/:id` | admin |
| GET / POST | `/media` | admin |
| PATCH / DELETE | `/media/:id` | admin |
| POST | `/inquiries` | service key or admin |
| GET | `/inquiries` | admin |
| PATCH / DELETE | `/inquiries/:id` | admin |
| GET / DELETE | `/inquiry-audit`, `/ga-events`, `/seo-audit-runs` | admin |
| POST | same three | service key or admin |
| GET / POST | `/smtp` | admin (GET also service key) |

Admin calls send `Authorization: Bearer <token>` from `/auth/login`. Website
backend calls send `x-service-key: <SERVICE_KEY>`.

## 4. Notes

- Passwords are bcrypt hashes, compatible with the PHP kit's `password_hash`.
- Uploads land in `UPLOAD_DIR` and are served at `/uploads`; `UPLOAD_URL` must
  point at the public URL of that same folder. Max 10MB, images + PDF only.
- `ALLOWED_ORIGINS` must list your live site origins or browser calls are
  blocked by CORS.
