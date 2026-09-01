# Work With Vrajesh — Cloudflare D1 backend (PHP)

This folder is the PHP REST API for the website. It talks to Cloudflare D1
(`workwithvrajesh-db`) over the Cloudflare HTTP API — no MySQL host is required.

## 1. Configure D1

Copy `.env.example` to `.env` and set the API token:

```
CLOUDFLARE_ACCOUNT_ID=7712e75c497be262dad6a07f2378e10d
CLOUDFLARE_D1_DATABASE_ID=3d54fc00-0b85-4b29-a63c-a3527785ba92
CLOUDFLARE_D1_DATABASE_NAME=workwithvrajesh-db
CLOUDFLARE_API_TOKEN=your-token
```

Create the tables once from the Node kit (same database):

```bash
cd ../node
npm run import-schema -- schema
```

## 2. Upload the API

Upload this whole folder to your hosting as `public_html/api`, so the API
answers at:

```
https://yourdomain.com/api/health
```

Create an empty, writable `uploads` folder inside it (chmod 755).

Before going live, replace the two placeholder secrets in `.env`:

- `WWV_API_KEY` — a long random string; the website sends it as `X-WWV-Key`
- `WWV_JWT_SECRET` — a different long random string used to sign admin logins

## 3. Create the admin login

Visit once, then delete the file:

```
https://yourdomain.com/api/create-admin.php?email=workwithvrajesh@gmail.com&password=Admin@Vrajesh123
```

## 4. Endpoints

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | public |
| POST | `/auth/login` | public |
| GET | `/auth/me` | admin token |
| GET | `/cms/documents/{key}` | public (published) / admin (all) |
| POST | `/cms/documents` | admin |
| GET | `/cms/collections/{collection}` | public (published) / admin (all) |
| POST | `/cms/collections/{collection}` | admin |
| PATCH / DELETE | `/cms/collections/{collection}/{id}` | admin |
| GET / POST / PATCH / DELETE | `/media[/{id}]` | admin |
| POST | `/inquiries` | service key |
| GET / PATCH / DELETE | `/inquiries[/{id}]` | admin |
| GET / POST / DELETE | `/inquiry-audit`, `/ga-events`, `/seo-audit-runs` | admin (POST also service key) |
| GET / POST | `/smtp` | admin (GET also service key) |

## 5. Tell the website where the API lives

Send me the public URL (e.g. `https://yourdomain.com/api`) and the `api_key`
you chose, and the site's CMS, admin panel, enquiries and uploads get pointed
at this API.
