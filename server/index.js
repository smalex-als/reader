import express from 'express';
import https from 'node:https';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import multer from 'multer';
import { DATA_DIR, HTTPS_CERT_PATH, HTTPS_KEY_PATH, HOST, MAX_UPLOAD_BYTES, PORT, ROOT_DIR, STATIC_ROOT } from './config.js';
import booksRouter from './routes/books.js';
import mediaRouter from './routes/media.js';
import healthRouter from './routes/health.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      // eslint-disable-next-line no-console
      console.log(
        `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
      );
    });
    next();
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    '/data',
    express.static(DATA_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.txt')) {
          res.setHeader('Cache-Control', 'no-store');
        }
      }
    })
  );
  app.use('/data', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.status(404).end();
      return;
    }
    next();
  });
  app.use(express.static(STATIC_ROOT));

  app.use(booksRouter);
  app.use(mediaRouter);
  app.use(healthRouter);

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    const indexPath = path.join(STATIC_ROOT, 'index.html');
    if (existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return next();
  });

  app.use((err, req, res, _next) => {
    const status =
      err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 413
        : err.status || 500;
    const message =
      err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`
        : err.message || 'Internal Server Error';
    // eslint-disable-next-line no-console
    console.error('Error handling request', { status, message, stack: err.stack });
    res.status(status).json({ error: message, status });
  });

  return app;
}

export function startServer() {
  const app = createApp();

  if (HTTPS_KEY_PATH && HTTPS_CERT_PATH) {
    const httpsOptions = {
      key: readFileSync(path.resolve(ROOT_DIR, HTTPS_KEY_PATH)),
      cert: readFileSync(path.resolve(ROOT_DIR, HTTPS_CERT_PATH))
    };
    https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on https://${HOST}:${PORT}`);
    });
  } else {
    app.listen(PORT, HOST, () => {
      // eslint-disable-next-line no-console
      console.log(`Server listening on http://${HOST}:${PORT}`);
    });
  }
}
