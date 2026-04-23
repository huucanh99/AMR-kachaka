'use strict';

const { Router } = require('express');
const settingsService = require('../services/settingsService');

const router = Router();

function handleError(res, err) {
  console.error('[Settings]', err.message);
  res.status(err.httpStatus || 500).json({ success: false, error: err.message });
}

// GET /api/settings
router.get('/', async (_req, res) => {
  try {
    const data = await settingsService.getSettings();
    res.json({ success: true, data });
  } catch (err) { handleError(res, err); }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const { pickupTimeoutSeconds, deliveryTimeoutSeconds } = req.body;
    const data = await settingsService.updateSettings({ pickupTimeoutSeconds, deliveryTimeoutSeconds });
    res.json({ success: true, data });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
