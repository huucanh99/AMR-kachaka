'use strict';

const { pool } = require('../config/db');

const DEFAULTS = {
  pickup_timeout_seconds:   30,
  delivery_timeout_seconds: 30,
};

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const map = { ...DEFAULTS };
  for (const row of rows) {
    const n = Number(row.value);
    if (!Number.isNaN(n) && n > 0) map[row.key] = n;
  }
  return {
    pickupTimeoutSeconds:   map.pickup_timeout_seconds,
    deliveryTimeoutSeconds: map.delivery_timeout_seconds,
  };
}

async function updateSettings({ pickupTimeoutSeconds, deliveryTimeoutSeconds } = {}) {
  const ops = [];

  if (pickupTimeoutSeconds !== undefined) {
    const v = Math.max(1, Math.round(Number(pickupTimeoutSeconds) || DEFAULTS.pickup_timeout_seconds));
    ops.push(pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['pickup_timeout_seconds', String(v)]
    ));
  }

  if (deliveryTimeoutSeconds !== undefined) {
    const v = Math.max(1, Math.round(Number(deliveryTimeoutSeconds) || DEFAULTS.delivery_timeout_seconds));
    ops.push(pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['delivery_timeout_seconds', String(v)]
    ));
  }

  await Promise.all(ops);
  return getSettings();
}

module.exports = { getSettings, updateSettings };
