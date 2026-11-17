import express from 'express';
import { createApiApp } from '../server/app.ts';
import { store } from '../server/storage/store.ts';

const WORKER_BASE_URL = (
  process.env.COLLECTOR_WORKER_URL ||
  process.env.BACKEND_WORKER_URL ||
  ''
)
  .trim()
  .replace(/\/+$/, '');

function normalizeVercelPath(req: express.Request): string {
  const rawPathParam = req.query.__path;
  if (typeof rawPathParam === 'string' && rawPathParam.trim() !== '') {
    const cleanSubpath = rawPathParam.replace(/^\/+/, '');
    const urlObj = new URL(req.url, 'http://localhost');
    urlObj.searchParams.delete('__path');
    const remainingSearch = urlObj.searchParams.toString();
    return `/api/${cleanSubpath}${remainingSearch ? `?${remainingSearch}` : ''}`;
  }
  if (req.url === '/api/index' || req.url.startsWith('/api/index?')) {
    const urlObj = new URL(req.url, 'http://localhost');
    urlObj.searchParams.delete('__path');
    const remainingSearch = urlObj.searchParams.toString();
    return `/api/health${remainingSearch ? `?${remainingSearch}` : ''}`;
  }
  return req.url;
}

const gateway = express();
const localApiApp = createApiApp();

if (WORKER_BASE_URL) {
  gateway.use(express.json({ limit: '1mb' }));

  gateway.use('/api', async (req, res, next) => {
    const targetPath = normalizeVercelPath(req);
    const reqHost = req.header('host')?.toLowerCase() ?? '';
    let workerHost = '';
    try {
      workerHost = new URL(WORKER_BASE_URL).host.toLowerCase();
    } catch {
      next();
      return;
    }

    // Prevent proxy loop if misconfigured to point at the same deployment
    if (!workerHost || (reqHost && workerHost === reqHost)) {
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, x-workspace-id, x-admin-token'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // Stream endpoint emits an instant worker status snapshot without hanging Vercel timeout
    if (targetPath === '/api/stream' || targetPath.startsWith('/api/stream?')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'close');
      res.flushHeaders?.();

      let workerStatus = store.collectorStatus;
      try {
        const statusRes = await fetch(`${WORKER_BASE_URL}/api/collector/status`, {
          signal: AbortSignal.timeout(5000),
        });
        if (statusRes.ok) {
          workerStatus = await statusRes.json();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Worker status check failed';
        workerStatus = {
          ...store.collectorStatus,
          pumpportal: {
            ...store.collectorStatus.pumpportal,
            status: 'ERROR',
            lastError: `Collector worker unreachable (${msg})`,
          },
        };
      }

      res.write(
        `data: ${JSON.stringify({
          type: 'snapshot',
          status: workerStatus,
          serverless: true,
          proxiedWorker: true,
        })}\n\n`
      );
      res.end();
      return;
    }

    const upstreamUrl = `${WORKER_BASE_URL}${targetPath}`;
    try {
      const forwardHeaders: Record<string, string> = {};
      const wsHeader = req.header('x-workspace-id');
      if (wsHeader) forwardHeaders['x-workspace-id'] = wsHeader;
      const adminHeader = req.header('x-admin-token');
      if (adminHeader) forwardHeaders['x-admin-token'] = adminHeader;

      let body: string | undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
        forwardHeaders['Content-Type'] = 'application/json';
        body = JSON.stringify(req.body);
      }

      const upstreamRes = await fetch(upstreamUrl, {
        method: req.method,
        headers: forwardHeaders,
        body,
        signal: AbortSignal.timeout(15_000),
      });

      const contentType = upstreamRes.headers.get('content-type') || 'application/json';
      const rawBody = await upstreamRes.text();
      res.status(upstreamRes.status).setHeader('Content-Type', contentType).send(rawBody);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upstream worker request failed';
      console.error(`[VERCEL PROXY] Failed forwarding ${req.method} ${upstreamUrl}:`, msg);
      res.status(502).json({
        error: `Collector worker unreachable at ${WORKER_BASE_URL}: ${msg}`,
      });
    }
  });
}

gateway.use(localApiApp);

export default gateway;
