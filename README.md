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

### Vercel Deployment (Frontend + Serverless Gateway `/api/*`)
- `vercel.json` routes all `/api/*` endpoints to `api/index.ts`.
- **Why PumpPortal & Helius report `DISCONNECTED` on standalone Vercel**: Vercel Serverless Functions freeze immediately after returning an HTTP response and cannot sustain a 24/7 WebSocket client to `wss://pumpportal.fun/api/data`, nor persist captured token events across ephemeral `/tmp` cold starts.
- **How to connect live 24/7 WebSocket detection to Vercel**:
  1. Deploy the dedicated always-on worker entrypoint (`worker.ts`) on a persistent Node.js host (Railway, Render Background/Web Service, Fly.io, DigitalOcean, or Cloud Run with `--min-instances=1`) using:
     ```bash
     npm install && npm run start:worker
     ```
  2. In your **Vercel Project Settings → Environment Variables**, set **`COLLECTOR_WORKER_URL`** (e.g. `https://your-worker.up.railway.app`) so `api/index.ts` proxies `/api/*` requests directly to your live worker with zero frontend rebuild required—or set **`VITE_API_BASE_URL`** for direct browser-to-worker REST + real-time SSE streaming.
  3. Inspect worker health at `GET /api/collector/health`.

### Stateful Persistent Worker Hosting (Single-Service Alternative)
Run `npm run build && npm run start` (serves both frontend `dist/` and collectors from `server.ts`) on a persistent Node.js host with a writable disk volume for `./data/alfitoms-db.json`.

---

## Environment Variables

Configure secrets via the host environment or `.env` in local development. Never expose secrets in client-side code.

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `PORT` | No (default `3000`) | HTTP + SSE server port |
| `COLLECTOR_WORKER_URL` | On Vercel (for live WS) | Persistent `worker.ts` base URL proxied by `api/index.ts` |
| `VITE_API_BASE_URL` | Optional | Build-time worker URL for direct browser REST + SSE `/api/stream` |
| `SOLANA_RPC_URL` | No | Custom Solana Mainnet RPC (defaults to `https://api.mainnet-beta.solana.com`) |
| `HELIUS_API_KEY` | Optional | Enables Helius Mainnet RPC & configurable `logsSubscribe` program monitoring |
| `PUMPPORTAL_API_KEY` | Optional | Only required if you opt into paid PumpPortal account/token trade streams |
| `TELEGRAM_BOT_TOKEN` | Optional | Enables server-side Telegram alert dispatch |
| `TELEGRAM_CHAT_ID` | Optional | Target Telegram chat/channel ID for alerts |
| `GEMINI_API_KEY` | Optional | Enables on-demand Gemini `gemini-4-hydrogen` research brief summaries |
| `ADMIN_SECRET` | Optional | Protects `POST/PATCH/DELETE /api/programs`, `/api/settings`, and `/api/collector/reconnect` via `x-admin-token` |

---

## Local Development & Verification

```bash
npm install
npm run dev      # Starts Express + Vite + PumpPortal collector on port 3000
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Production Vite client bundle
npm run start    # Runs production Express server serving dist/
```
