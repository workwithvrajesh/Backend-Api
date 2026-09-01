# Cloudflare D1

The Node and PHP APIs both talk to the remote D1 database `workwithvrajesh-db`
over the Cloudflare HTTP API. Wrangler bindings are documented in
`wrangler.toml` at the repo root.

```
Account ID   7712e75c497be262dad6a07f2378e10d
Database ID  3d54fc00-0b85-4b29-a63c-a3527785ba92
Database     workwithvrajesh-db
```

Put the API token in `backend/node/.env` (and `backend/php/.env`) as
`CLOUDFLARE_API_TOKEN`. Do not commit the token.

```bash
cd backend/node
npm run import-schema          # creates tables in remote D1
npm run create-admin workwithvrajesh@gmail.com 'Admin@Vrajesh123'
```
