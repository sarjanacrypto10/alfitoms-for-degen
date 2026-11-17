import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './server/app.ts';
import { heliusCollector } from './server/services/heliusCollector.ts';
import { pumpportalCollector } from './server/services/pumpportalCollector.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer(): Promise<void> {
  const app = createApiApp();

  // Frontend Delivery (Vite Middleware in Dev, Static dist/ in Prod)
  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ALFITOMS FOR DEGEN] Server running on http://0.0.0.0:${PORT}`);
    // Boot persistent server-side WebSocket collectors
    pumpportalCollector.start();
    heliusCollector.syncWithSettings();
  });
}

void startServer();
