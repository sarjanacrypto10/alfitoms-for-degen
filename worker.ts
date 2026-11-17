import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createApiApp } from './server/app.ts';
import { pumpportalCollector } from './server/services/pumpportalCollector.ts';
import { store } from './server/storage/store.ts';

const PORT = Number(process.env.PORT || 3000);

function startWorker(): void {
  const app = createApiApp();

  // Root health/info route so PaaS health checks (Railway, Render, Fly.io, Cloud Run) succeed cleanly
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
  }

  app.get('/', (_req, res) => {
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      res.sendFile(indexHtml);
      return;
    }
    store.recomputeStatusCounters();
    res.json({
      ok: true,
      service: 'ALFITOMS FOR DEGEN Collector Worker',
      network: 'solana-mainnet',
      collectorStatus: store.collectorStatus,
      healthEndpoint: '/api/collector/health',
      overviewEndpoint: '/api/overview',
      streamEndpoint: '/api/stream',
      timestamp: new Date().toISOString(),
    });
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ALFITOMS WORKER] Always-on PumpPortal worker listening on http://0.0.0.0:${PORT}`);
    console.log('[ALFITOMS WORKER] Helius integration: OPTIONAL / SKIPPED');
    // Boot primary free PumpPortal WebSocket collector (subscribeNewToken & subscribeMigration)
    pumpportalCollector.start();
  });

  const shutdown = (signal: string) => {
    console.log(`[ALFITOMS WORKER] Received ${signal}, flushing store and closing sockets...`);
    pumpportalCollector.stop();
    store.persistNow();
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startWorker();
