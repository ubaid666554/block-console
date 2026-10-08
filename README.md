# Block console

Slot occupancy and dispatch tracking for a block of 24 positions.
Next.js (React frontend + Node API routes) on PostgreSQL.

## What it does

- Shows all 24 slots as a grid; filled cells are held, outlined cells are free.
- Dispatch releases *n* slots, recorded against a selected position.
- Load refills empty slots.
- Every dispatch is written to an event log with position, quantity, slot numbers, operator and timestamp.

Free capacity is always counted from the slot rows. It is never stored as a
number, because a stored counter drifts out of sync the first time an operation
fails partway through.

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Get a Postgres connection string. Any of these give you one free:
   - [Neon](https://neon.tech) — what Vercel Postgres uses underneath
   - [Supabase](https://supabase.com)
   - [Railway](https://railway.app)

   Or use a local Postgres: `postgresql://localhost:5432/blockconsole`

3. Create `.env.local` with that string:

   ```
   DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-browser-key
   ```

   The Google key must have Maps JavaScript API enabled, billing enabled, and
   an application restriction allowing `http://localhost:3000/*`.

4. Start it:

   ```bash
   npm run dev
   ```

5. Open http://localhost:3000. The first screen offers a setup button that
   creates the tables and seeds one full block of 24. Click it once.

## Deploying to Vercel

1. Push the project to a GitHub repository.
2. In Vercel, choose **Add New → Project** and import that repository.
   Vercel detects Next.js; no build settings to change.
3. Under **Settings → Environment Variables**, add `DATABASE_URL` with the same
   connection string. Add it to Production, Preview and Development.
4. Deploy, open the URL, and click the setup button once.

**Before you present:** free Postgres tiers suspend after a period of
inactivity, so the first query after a quiet spell can take several seconds.
Load the page a few minutes beforehand to wake the database.

## How a dispatch works

Everything below happens inside one transaction, so a failure anywhere leaves
the block exactly as it was.

1. Check the selected position exists and is active.
2. `SELECT … WHERE status = 'occupied' ORDER BY slot_number LIMIT n FOR UPDATE`
   — `FOR UPDATE` locks those rows for the life of the transaction, so two
   operators dispatching at the same moment cannot claim the same slots.
3. If fewer rows came back than requested, abort before changing anything.
4. Insert the `dispatch_events` header row.
5. For each slot: insert a `dispatch_event_slots` child row, set the slot to
   `empty`, and append to `slot_history`.
6. Commit.

## Schema

| Table | Holds |
|---|---|
| `blocks` | One row per block, with its capacity |
| `slots` | One row per position; status is `empty`, `occupied`, `reserved` or `maintenance` |
| `positions` | Predefined sites, with coordinates |
| `dispatch_events` | One row per dispatch: block, position, operator, quantity, time |
| `dispatch_event_slots` | Which slots each event released |
| `slot_history` | Every status transition, with reason and operator |

Full DDL is in `db/schema.sql`.

## Project layout

```
app/
  page.js              React console — grid, controls, event log
  layout.js            Root layout and fonts
  globals.css          Design tokens and styles
  api/
    state/route.js     GET  block, slots, positions, recent events
    dispatch/route.js  POST release n slots against a position
    load/route.js      POST refill n empty slots
    setup/route.js     POST create schema and seed one block
lib/db.js              Connection pool and transaction helper
db/schema.sql          PostgreSQL DDL
```

## Points worth making in the writeup

- **Derived capacity.** Free space is `COUNT(*) WHERE status = 'empty'`, not a
  stored total.
- **Transaction boundaries.** A rejected over-request changes nothing — you can
  demonstrate this live by asking for more than the block holds.
- **Row locking.** `FOR UPDATE` is what makes concurrent dispatch safe.
- **Event plus child rows.** The log records which slots went and from where,
  not merely how many.
- **Why Postgres and not SQLite.** Vercel's filesystem is ephemeral, so a
  SQLite file would be wiped on redeploy. The deployment target drove the
  database choice.
