'use strict';

const express = require('express');
const cors = require('cors');
const robotRouter    = require('./routes/robot');
const tasksRouter    = require('./routes/tasks');
const settingsRouter = require('./routes/settings');
const logsRouter     = require('./routes/logs');
const authRouter     = require('./routes/auth');

function createApp(io) {
  const app = express();

  // ── Middleware ────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim());

  app.use(cors({
    origin: (origin, cb) => {
      // allow requests with no origin (curl, Postman, etc.)
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }));

  app.use(express.json());

  // ── Inject io so routes can emit events ──────────────────────────────────
  app.use((req, _res, next) => { req.io = io; next(); });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth',     authRouter);
  app.use('/api/robot',    robotRouter);
  app.use('/api/tasks',    tasksRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/logs',     logsRouter);

  // Health check
  app.get('/health', (_req, res) => res.json({ ok: true }));

  // 404 fallback
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // Global error handler
  app.use((err, _req, res, _next) => {
    console.error('[Express]', err.message);
    res.status(500).json({ error: err.message });
  });

  return app;
}

module.exports = { createApp };
