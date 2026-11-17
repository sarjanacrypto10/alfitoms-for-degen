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

Standard stateless serverless functions (e.g., AWS Lambda, Vercel Functions) terminate idle HTTP handlers and **cannot** maintain a long-lived PumpPortal WebSocket connection.

To keep live WebSocket detection running continuously:
1. **Single-Service Stateful Container / VPS**: Run `npm run build && npm run start` on a persistent Node.js host (Fly.io, Railway, Render Background/Web Service, DigitalOcean, or Google Cloud Run with `--min-instances=1` and CPU always allocated).
2. **Separated Worker Architecture (Recommended for Serverless Web Hosts)**: If hosting the frontend on a serverless platform, run the collector service on a dedicated always-on Node.js worker connected to a shared database (Firestore / Redis / Postgres).

---

## Environment Variables

Configure secrets via the **Settings > Secrets** panel (or `.env` in local development). Never expose secrets in client-side code.

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `PORT` | No (default `3000`) | HTTP + SSE server port |
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
