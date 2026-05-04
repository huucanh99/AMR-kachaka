'use strict';

const { pool } = require('../config/db');

const VALID_LANGS = ['en', 'zh-TW'];

const DEFAULTS = {
  pickup_timeout_seconds:   30,
  delivery_timeout_seconds: 30,
  language:                 'en',
};

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  const map = {};
  for (const row of rows) map[row.key] = row.value;

  return {
    pickupTimeoutSeconds:   Math.max(1, Number(map.pickup_timeout_seconds)   || DEFAULTS.pickup_timeout_seconds),
    deliveryTimeoutSeconds: Math.max(1, Number(map.delivery_timeout_seconds) || DEFAULTS.delivery_timeout_seconds),
    language:               VALID_LANGS.includes(map.language) ? map.language : DEFAULTS.language,
  };
}

async function updateSettings({ pickupTimeoutSeconds, deliveryTimeoutSeconds, language } = {}) {
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

  if (language !== undefined && VALID_LANGS.includes(language)) {
    ops.push(pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['language', language]
    ));
  }

  await Promise.all(ops);
  return getSettings();
}

module.exports = { getSettings, updateSettings };
