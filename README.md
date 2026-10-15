# DoomDesk-AI: Sri Lanka News Intelligence & Price Prediction System

A hybrid intelligence platform that continuously monitors Sri Lanka news, economic releases, fuel prices, and exchange rates on free cloud infrastructure, delivering priority intelligence and native notifications to the Windows desktop.

## Architecture

- **Cloud Engine (Free Tier):** Cloudflare Workers + D1 Database
  - Ingestion: Small-batch queue scheduler (<10ms CPU)
  - Duplicate detection: 64-bit SimHash
  - Verification & Corroboration: Cross-source claim analysis, publisher grouping (syndication separation)
  - Alert API: Monotonic integer ID cursor (`/api/alerts?after_id=X`) for at-least-once recovery after laptop restart/sleep
- **Desktop Application:** React + TypeScript + Tailwind CSS (Tauri)
  - Background system tray process
  - Native Windows notifications for confirmed revisions and elevated risks
  - Offline cursor recovery

## Project Structure

```text
DoomDesk-Ai/
├── mem.md                  # Comprehensive engineering design & specification (v1.1)
├── scripts/
│   └── probe.js            # Milestone 0 source accessibility & caching headers probe
└── services/
    └── worker/             # Cloudflare Worker & D1 database
        ├── src/
        │   ├── lib/
        │   │   ├── detector.ts  # Critical event & price trigger detection
        │   │   ├── rss.ts       # Ultra-lightweight XML/RSS parser
        │   │   ├── simhash.ts   # 64-bit title fingerprinting & hamming distance
        │   │   └── time.ts      # Asia/Colombo time calculations
        │   └── index.ts    # API routes, probe endpoint, scheduled worker
        ├── schema.sql      # D1 SQLite schema and seed sources
        ├── wrangler.toml   # Cloudflare configuration
        └── package.json
```

## Quick Start (Cloudflare Worker & Local D1)

```powershell
cd services/worker
npm install
npm run db:init:local
npm run dev
```

### Endpoints

- `GET /health` - Health status, UTC and Asia/Colombo time, article and alert counts.
- `GET /api/alerts?after_id={cursor}` - Fetch alerts after monotonic cursor ID.
- `GET /api/articles?category={category}` - 40 daily ranked articles by category.
- `GET /api/sources` - Source registry status and failure counts.
- `GET /api/probe?url={target_url}` - Milestone 0 probe tool from Cloudflare edge.
- `POST /api/collect/run` - Trigger immediate small-batch collection cycle.
- `POST /api/alerts/test` - Trigger a test alert for desktop notification verification.
