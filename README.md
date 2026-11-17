# ALFITOMS FOR DEGEN

**Discover Early. Analyze Deeper. Trade Smarter.**  
Founder: **ALFITO MUZZAMIL**  
Supported Network: **Solana Mainnet-Beta Only**

ALFITOMS FOR DEGEN is a full-stack Solana memecoin discovery and risk intelligence terminal designed around a **free-first, deterministic, evidence-based** architecture.

---

## Architecture Overview

### 1. Persistent Server-Side WebSocket Collectors (`server/services/`)
- **PumpPortal Collector (`pumpportalCollector.ts`)**: Connects to `wss://pumpportal.fun/api/data` as a single persistent server-side worker (never one connection per browser client).
  - Subscribes to free documented methods: `subscribeNewToken` and `subscribeMigration`.
  - Paid/metered PumpPortal trade feeds are **not** activated automatically.
  - Implements exponential backoff reconnection, 25s ping/pong heartbeat checks, error logging, and mint+signature deduplication.
  - Broadcasts updates to browsers via Server-Sent Events (`GET /api/stream`).
- **Optional Helius Stream (`heliusCollector.ts`)**: Disabled by default. Only activates when `HELIUS_API_KEY` is configured and explicitly enabled in **Settings**. Monitors configurable Solana Program IDs via `logsSubscribe`.

### 2. Market Intelligence (`dexScreenerService.ts`)
- Fetches live Solana pair data (`priceUsd`, `liquidity`, `volume`, `marketCap`, `fdv`, `txns`, `priceChange`) from the public DexScreener API.
- Implements configurable response caching (45s default), HTTP 429 rate-limit cooldown, 8s request timeouts, and retry logic.
- Missing metrics always render as `N/A`—never fabricated.

### 3. Deterministic On-Chain Wallet & Risk Engine (`solanaOnChainService.ts`, `riskEngine.ts`)
- Inspects any Solana Mainnet SPL or Token-2022 mint address via Solana JSON-RPC:
  - Mint Authority & Freeze Authority status
  - Token-2022 extensions (`permanentDelegate`, `transferFeeConfig`, `transferHook`, `nonTransferable`)
  - Metaplex Metadata PDA `isMutable` parsing
  - Top 20 token accounts & Top 1 / Top 5 / Top 10 supply concentration
  - Same-slot transaction bundle detection and creator SOL funding trace
- **Strict Verification Policy**:
  - Never guarantees safety or profitability.
  - Never marks LP as locked or burned without direct on-chain LP burn/lock proof (`lpStatus: 'unverified'`).
  - Optional Gemini research brief (`gemini-4-hydrogen`) runs **only** when explicitly clicked by the user.

### 4. Persistent Storage (`server/storage/store.ts`)
- Persists collections (`tokens`, `token_events`, `market_snapshots`, `wallet_analytics`, `risk_assessments`, `watchlists`, `alerts`, `collector_logs`, `monitored_programs`, `settings`) to `./data/alfitoms-db.json` with bounded ring-buffer caps.

---

## Hosting & Persistent Worker Requirements

### Railway Persistent Worker Deployment (`sarjanacrypto10/alfitoms-for-degen`)
1. In Railway, create a **New Project → Deploy from GitHub Repo** (`sarjanacrypto10/alfitoms-for-degen`).
2. `railway.json` configures the worker automatically:
   - **Start Command**: `npm run start:worker` (`worker.ts`)
   - **Health Check Path**: `/api/collector/health`
   - **Restart Policy**: `ON_FAILURE` (up to 10 retries)
3. Attach a **Railway Volume** mounted at `/data` (Railway sets `RAILWAY_VOLUME_MOUNT_PATH=/data`, or set `DATA_DIR=/data`) so `alfitoms-db.json` persists across restarts and deploys.
4. Generate a public domain for the Railway service in **Settings → Networking**.
5. Optional environment variables on Railway:
   - `SOLANA_RPC_URL` (recommended private/faster Solana Mainnet RPC; defaults to `https://api.mainnet-beta.solana.com`)
   - `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_SECRET`
   - Helius is **OPTIONAL / SKIPPED** and `HELIUS_API_KEY` is **not** required.

### Connecting Vercel (`https://alfitoms-for-degen.vercel.app`) to Railway
In **Vercel Project Settings → Environment Variables**, set:
- **`COLLECTOR_WORKER_URL`** = `https://<your-railway-worker-domain>` (no trailing slash) — `api/index.ts` proxies all `/api/*` requests (`/api/overview`, `/api/tokens`, `/api/events`, `/api/collector/health`, `/api/alerts`, `/api/watchlist`) directly to the Railway worker so Vercel and Railway read/write the exact same persisted store without split-brain memory.
- *(Optional)* **`VITE_API_BASE_URL`** = `https://<your-railway-worker-domain>` — rebuilds Vercel to stream `/api/stream` (SSE) directly from the browser to Railway.

### Local Single-Process Hosting (Alternative)
Run `npm run build && npm run start` (serves both frontend `dist/` and PumpPortal collector via `server.ts`).

---

## Environment Variables

Configure secrets via the host environment or `.env` in local development. Never expose secrets in client-side code.

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `PORT` | No (default `3000`) | HTTP + SSE server port (injected automatically by Railway) |
| `DATA_DIR` | On Railway (`/data`) | Persistent directory for `alfitoms-db.json` (auto-reads `RAILWAY_VOLUME_MOUNT_PATH`) |
| `COLLECTOR_WORKER_URL` | On Vercel | Railway worker base URL proxied by Vercel `api/index.ts` |
| `VITE_API_BASE_URL` | Optional (Vercel) | Build-time Railway worker URL for direct browser REST + SSE `/api/stream` |
| `SOLANA_RPC_URL` | Optional | Custom Solana Mainnet RPC (defaults to `https://api.mainnet-beta.solana.com`) |
| `HELIUS_API_KEY` | Skipped / Optional | Not required; Helius collector initialization is disabled (`OPTIONAL / SKIPPED`) |
| `PUMPPORTAL_API_KEY` | Optional | Not required for free `subscribeNewToken` & `subscribeMigration` |
| `TELEGRAM_BOT_TOKEN` | Optional | Enables server-side Telegram alert dispatch |
| `TELEGRAM_CHAT_ID` | Optional | Target Telegram chat/channel ID for alerts |
| `GEMINI_API_KEY` | Optional | Enables on-demand Gemini `gemini-4-hydrogen` research brief summaries |
| `ADMIN_SECRET` | Optional | Protects `/api/programs`, `/api/settings`, and `/api/collector/reconnect` via `x-admin-token` |

---

## Local Development & Verification

```bash
npm install
npm run dev      # Starts Express + Vite + PumpPortal collector on port 3000
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Production Vite client bundle
npm run start    # Runs production Express server serving dist/
```
