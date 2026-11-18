/**
 * ------------------------------------------------------------------
 * POLE MAP ENGINE - เทศบาลตำบลแม่สาย (Modular Architecture)
 * ------------------------------------------------------------------
 * Port: 3406
 * Routes: /polemap/ (Main Map), /polemap/manage, /polemap/back, /polemap/api/
 * Standards: ARC-003 + DEC-026 + DEC-027 + DEC-028
 * ------------------------------------------------------------------
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { PROJECT_DIR, UPLOADS_DIR, PORT, getAllowedOrigins, ensureDirectories } = require('./src/config.cjs');
const { initSecurityLogs, securityRadarMiddleware } = require('./src/security/radar.cjs');
const { createApiRouter } = require('./src/routes/api.cjs');

function createApp() {
  ensureDirectories();
  initSecurityLogs();

  const app = express();
  app.set('trust proxy', 1);

  // Strict CORS (Only allow configured municipal origins; allow non-browser requests with no Origin header)
  const allowedOrigins = getAllowedOrigins();
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Master-Key');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(origin && !allowedOrigins.includes(origin) ? 403 : 204);
    }
    next();
  });

  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));
  app.use(securityRadarMiddleware);

  // API Routes (Dual prefix support)
  const apiRouter = createApiRouter();
  app.use('/polemap/api', apiRouter);
  app.use('/api', apiRouter);

  // Static Files
  app.use('/polemap/uploads', express.static(UPLOADS_DIR));
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/polemap/public', express.static(path.join(PROJECT_DIR, 'public')));
  app.use('/public', express.static(path.join(PROJECT_DIR, 'public')));

  app.get(['/polemap/polemap_logo.png', '/polemap_logo.png'], (req, res) => {
    const logoFile = fs.existsSync(path.join(PROJECT_DIR, 'polemap_logo.png'))
      ? path.join(PROJECT_DIR, 'polemap_logo.png')
      : path.join(PROJECT_DIR, 'public', 'polemap_logo.png');
    res.sendFile(logoFile);
  });

  // HTML Pages
  app.get(['/polemap', '/polemap/', '/', '/index', '/index.html', '/polemap/index', '/polemap/index.html'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(PROJECT_DIR, 'index.html'));
  });

  app.get(['/polemap/manage', '/manage', '/manage.html', '/polemap/manage.html'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(PROJECT_DIR, 'manage.html'));
  });

  app.get(['/polemap/back', '/back', '/back.html', '/polemap/back.html'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(PROJECT_DIR, 'back.html'));
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` POLE MAP SERVER RUNNING ON PORT: ${PORT}`);
    console.log(` Main Map:    http://127.0.0.1:${PORT}/polemap/`);
    console.log(` Management:  http://127.0.0.1:${PORT}/polemap/manage`);
    console.log(` Security:    http://127.0.0.1:${PORT}/polemap/back`);
    console.log(` REST API:    http://127.0.0.1:${PORT}/polemap/api/poles`);
    console.log(`=======================================================`);
  });
}

module.exports = { createApp };
