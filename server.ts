import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import dotenv from 'dotenv';
import { initDatabase } from './server/db.ts';
import { registerRoutes } from './server/routes.ts';
import { setupWebSocketServer } from './server/ws.ts';

dotenv.config();

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  const db = initDatabase();
  const httpServer = http.createServer(app);
  setupWebSocketServer(httpServer);
  registerRoutes(app, db);

  app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Abdali Education Academy server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
