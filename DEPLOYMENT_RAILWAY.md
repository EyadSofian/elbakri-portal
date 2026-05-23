# Deployment on Railway

## Service Setup

1. Create a new Railway project.
2. Add a **PostgreSQL** service and note the connection string.
3. Add a **Web Service** pointed at this repository.

## Environment Variables

Set the following in the Railway web service:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string from the Railway Postgres service (copy the "Internal URL") |
| `JWT_SECRET` | A long random secret for signing JWT tokens |
| `REFRESH_TOKEN_SECRET` | A long random secret for refresh tokens |
| `BASE_URL` | Your public Railway URL, e.g. `https://your-app.up.railway.app` |
| `PORT` | Railway sets this automatically — do **not** override it |
| `INTERNAL_TEAM_EMAIL` | (Optional) Email address that receives booking notifications |

## Build & Deploy Commands

In the Railway service settings:

| Setting | Value |
|---|---|
| **Build Command** | `npm install && npm run build && npx prisma generate` |
| **Pre-deploy Command** | `npx prisma migrate deploy` |
| **Start Command** | `node dist/app.js` |

> **Why separate pre-deploy and start?**  
> `prisma migrate deploy` only needs to run once per deployment to apply pending migrations.  
> Bundling it into the start command runs it on every dyno restart, which is slower and can cause issues in high-availability setups.

## Database Seeding

Seeding should only run **once** when first setting up the database — not on every deploy.

```bash
# Run manually from your local machine (with DATABASE_URL pointed at Railway):
DATABASE_URL="<railway-internal-url>" npx ts-node prisma/seed.ts
```

Or via Railway's one-off command runner after the first deploy.

## Summary of Script Roles

```
npm run build          → compile TypeScript to dist/
npx prisma generate    → regenerate Prisma client (runs as part of build)
npx prisma migrate deploy  → apply pending SQL migrations (pre-deploy step)
node dist/app.js       → start the server (start command)
```

## Local Development

```bash
cp .env.example .env          # fill in DATABASE_URL etc.
npm run db:migrate            # create/apply dev migrations
npm run db:seed               # seed initial data (once)
npm run dev                   # start with hot-reload (ts-node + nodemon)
```
