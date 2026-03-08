# Tender Hunter MVP

Tender qualification for small IT consultancies.

This repository ships a real MVP scaffold with:
- Next.js app router frontend
- Prisma + PostgreSQL storage path
- saved searches and scoring engine
- TED importer hook
- daily digest script
- demo mode with sample tenders so the UI runs immediately

## Why this is not a TED clone
TED already gives search, saved searches, alerts, and raw notice access. Tender Hunter is built as a supplier-centric qualification layer on top: saved searches start from what the consultancy sells, fit scoring explains why a notice matters, and exclusion logic removes junk.

## MVP scope in this codebase
- Landing page
- Dashboard with ranked matches
- Create saved search form
- Tender detail page with matching reasons
- Import worker for TED Search API
- Database-backed persistence for tenders, lots, saved searches, pipeline state, and AI scores
- Digest script for daily ranked alerts

## Run locally in demo mode
```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

## Recommended production database
Use **Neon** if you deploy on Vercel.

Why:
- Vercel’s current storage model is Marketplace integrations, and Neon is the most natural Postgres fit there.
- Neon gives you a pooled Postgres connection that works well with Vercel’s serverless model.
- Vercel can inject the connection string into your project automatically.

## Switch to Neon on Vercel
1. In Vercel, install the **Neon** Marketplace integration for this project.
2. Let Vercel inject the Neon connection string into your environment variables.
3. Set `STORAGE_BACKEND=database`.
4. Pull the Vercel env vars locally if you want local DB-backed development:
   ```bash
   vercel env pull
   ```
5. Generate the Prisma client and apply the schema:
   ```bash
   npm run db:generate
   npm run db:push
   ```
6. If you already have flat-file MVP data in `data/*.json`, migrate it:
   ```bash
   npm run db:migrate:files
   ```
7. Configure `TED_QUERY` to your target niche.
8. Import notices:
   ```bash
   npm run import
   ```
9. Start the app:
   ```bash
   npm run dev
   ```

## Local Postgres smoke tests
If you want a disposable local Postgres instead of Neon while developing migration logic, you can still use Docker:
```bash
docker compose up -d
```

## Storage backends
- `STORAGE_BACKEND=file`: JSON files in `data/` (default MVP mode)
- `STORAGE_BACKEND=database`: PostgreSQL via Prisma, with Neon as the recommended hosted provider on Vercel

The app keeps the flat-file backend so you can migrate safely and switch environments without rewriting the scoring or UI layers.

## Suggested first TED query
The exact query syntax can evolve with the TED Search API. Keep the first version simple and niche-driven, for example software, cloud, cyber, and support-oriented notices only. Tune it based on what the importer returns in your environment.

## Production next steps
- Add authentication and team workspaces
- Persist scored matches rather than calculating on read
- Add real email sending via Resend or Postmark
- Add buyer watchlists and authority intelligence
- Add national sources after TED is stable
- Improve TED field mapping once you confirm the exact payload shape in your environment

## Important caveat
The TED importer uses the official open Search API endpoint, but the exact JSON response fields can vary depending on the query and version. The normalization layer is intentionally defensive and designed to be adjusted quickly once you inspect real payloads in your target environment.
