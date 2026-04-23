'use strict';

const { Router }    = require('express');
const logService    = require('../services/logService');

const router = Router();

const VALID_LEVELS = ['INFO', 'WARN', 'ERROR'];

function handleError(res, err) {
  console.error('[Logs]', err.message);
  res.status(err.httpStatus || 500).json({ success: false, error: err.message });
}

// GET /api/logs?level=INFO&limit=50&offset=0
router.get('/', async (req, res) => {
  try {
    const { level, limit, offset } = req.query;

    if (level && !VALID_LEVELS.includes(level)) {
      return res.status(400).json({
        success: false,
        error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}`,
      });
    }

    const { logs, total } = await logService.getLogs({ level, limit, offset });

    const safeLimit  = Math.min(Number(limit)  || 50, 200);
    const safeOffset = Math.max(Number(offset) || 0,  0);

    res.json({
      success: true,
      data: { logs, pagination: { total, limit: safeLimit, offset: safeOffset } },
    });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
