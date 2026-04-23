'use strict';

const { Router } = require('express');
const { call, getRequest } = require('../grpc/kachakaClient');
const robotService = require('../services/robotService');
const { pool } = require('../config/db');

const router = Router();

// Helper: send a clean error response
function handleError(res, err) {
  console.error('[Route]', err.message);
  const status = err.code === 'NO_PAUSED_TASK' ? 409 : 500;
  res.status(status).json({ success: false, error: err.message });
}

// ---------------------------------------------------------------------------
// Robot status & info
// ---------------------------------------------------------------------------

/** GET /api/robot/status  – pose + battery + command state + active task */
router.get('/status', async (req, res) => {
  try {
    const status = await robotService.getRobotStatus();
    res.json({ success: true, data: status });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/ready  – quick liveness check */
router.get('/ready', async (req, res) => {
  try {
    const data = await call('IsReady', {});
    res.json({ success: true, ready: data.ready });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/battery */
router.get('/battery', async (req, res) => {
  try {
    const data = await call('GetBatteryInfo', getRequest());
    res.json({
      success: true,
      data: {
        percentage: data.remaining_percentage,
        status: data.power_supply_status,
      },
    });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/pose */
router.get('/pose', async (req, res) => {
  try {
    const data = await call('GetRobotPose', getRequest());
    res.json({ success: true, data: data.pose });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// Locations & shelves
// ---------------------------------------------------------------------------

/** GET /api/robot/moving-shelf — shelf the robot is currently carrying (empty string = none) */
router.get('/moving-shelf', async (req, res) => {
  try {
    const data = await call('GetMovingShelfId', getRequest());
    const shelfId = data.shelf_id || null;

    // If carrying a shelf, also fetch its name from GetShelves
    let shelfName = null;
    if (shelfId) {
      const shelvesData = await call('GetShelves', getRequest());
      const shelf = (shelvesData.shelves || []).find(s => s.id === shelfId);
      shelfName = shelf?.name || shelfId;
    }

    res.json({ success: true, data: { shelfId, shelfName } });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/locations */
router.get('/locations', async (req, res) => {
  try {
    const data = await call('GetLocations', getRequest());
    res.json({ success: true, data: data.locations });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/shelves */
router.get('/shelves', async (req, res) => {
  try {
    const data = await call('GetShelves', getRequest());
    res.json({ success: true, data: data.shelves });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * POST /api/robot/move
 * Body: { locationId: string, ttsOnSuccess?: string }
 */
router.post('/move', async (req, res) => {
  try {
    const { locationId, ttsOnSuccess } = req.body;
    if (!locationId) return res.status(400).json({ success: false, error: 'locationId is required' });

    const result = await robotService.moveToLocation(locationId, { ttsOnSuccess });

    // Broadcast to all socket clients
    req.io.emit('robot:command_started', { commandId: result.commandId, locationId });

    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/pause */
router.post('/pause', async (req, res) => {
  try {
    const result = await robotService.pauseRobot();
    req.io.emit('robot:paused', result);
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/resume */
router.post('/resume', async (req, res) => {
  try {
    const result = await robotService.resumeRobot();
    req.io.emit('robot:command_started', { commandId: result.commandId, resumed: true });
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/emergency-stop */
router.post('/emergency-stop', async (req, res) => {
  try {
    const result = await robotService.emergencyStop();
    req.io.emit('robot:emergency_stop', {});
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/dock-shelf */
router.post('/dock-shelf', async (req, res) => {
  try {
    const data = await call('StartCommand', {
      command: { dock_shelf_command: {} },
      cancel_all: true,
    });
    if (!data.result.success) {
      return res.status(500).json({ success: false, error: `StartCommand failed (code ${data.result.error_code})` });
    }
    req.io.emit('robot:command_started', { commandId: data.command_id, action: 'dock_shelf' });
    res.json({ success: true, data: { commandId: data.command_id } });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/undock-shelf */
router.post('/undock-shelf', async (req, res) => {
  try {
    const data = await call('StartCommand', {
      command: { undock_shelf_command: {} },
      cancel_all: true,
    });
    if (!data.result.success) {
      return res.status(500).json({ success: false, error: `StartCommand failed (code ${data.result.error_code})` });
    }
    req.io.emit('robot:command_started', { commandId: data.command_id, action: 'undock_shelf' });
    res.json({ success: true, data: { commandId: data.command_id } });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/return-home */
router.post('/return-home', async (req, res) => {
  try {
    const data = await call('StartCommand', {
      command: { return_home_command: {} },
      cancel_all: true,
    });
    if (!data.result.success) {
      return res.status(500).json({ success: false, error: `StartCommand failed (code ${data.result.error_code})` });
    }
    req.io.emit('robot:command_started', { commandId: data.command_id, action: 'return_home' });
    res.json({ success: true, data: { commandId: data.command_id } });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/cancel */
router.post('/cancel', async (req, res) => {
  try {
    const data = await call('CancelCommand', {});
    req.io.emit('robot:command_cancelled', {});
    res.json({ success: true, data: { result: data.result } });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/command-state */
router.get('/command-state', async (req, res) => {
  try {
    const data = await call('GetCommandState', getRequest());
    res.json({
      success: true,
      data: { state: data.state, commandId: data.command_id },
    });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// Tasks (DB)
// ---------------------------------------------------------------------------

/** GET /api/robot/tasks?limit=50 */
router.get('/tasks', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const tasks = await robotService.listTasks(limit);
    res.json({ success: true, data: tasks });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/shelf-layers?shelfId=shelf-001 */
router.get('/shelf-layers', async (req, res) => {
  try {
    const { shelfId } = req.query;
    if (!shelfId) return res.status(400).json({ success: false, error: 'shelfId is required' });

    const { rows } = await pool.query(`
      SELECT sl.shelf_id, sl.layer, sl.status, sl.updated_at,
             t.id AS task_id, t.receiver_name
        FROM shelf_layers sl
        LEFT JOIN tasks t
          ON t.shelf_id    = sl.shelf_id
         AND t.shelf_layer = sl.layer
         AND t.status IN ('waiting','in_progress')
       WHERE sl.shelf_id = ?
       ORDER BY sl.layer ASC
    `, [shelfId]);

    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
});

/** POST /api/robot/shelf-layers  — create a new shelf layer */
router.post('/shelf-layers', async (req, res) => {
  try {
    const { shelfId, layer, maxWeight } = req.body;
    if (!shelfId || !shelfId.trim()) {
      return res.status(400).json({ success: false, error: 'shelfId is required' });
    }
    const layerNum = Number(layer);
    if (!Number.isInteger(layerNum) || layerNum < 1) {
      return res.status(400).json({ success: false, error: 'layer must be a positive integer' });
    }
    const weight = Number(maxWeight) || 5.0;

    const { rows: existing } = await pool.query(
      'SELECT id FROM shelf_layers WHERE shelf_id = ? AND layer = ?',
      [shelfId.trim(), layerNum]
    );
    if (existing.length) {
      return res.status(409).json({ success: false, error: `Layer ${layerNum} already exists for shelf ${shelfId}` });
    }

    await pool.query(
      'INSERT INTO shelf_layers (shelf_id, layer, max_weight, status) VALUES (?, ?, ?, ?)',
      [shelfId.trim(), layerNum, weight, 'active']
    );

    const { rows } = await pool.query(
      'SELECT * FROM shelf_layers WHERE shelf_id = ? AND layer = ?',
      [shelfId.trim(), layerNum]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { handleError(res, err); }
});

/** PATCH /api/robot/shelf-layers/:shelfId/:layer  — update status or max_weight */
router.patch('/shelf-layers/:shelfId/:layer', async (req, res) => {
  try {
    const { shelfId, layer } = req.params;
    const { status, maxWeight } = req.body;

    if (status !== undefined && !['active', 'maintenance'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be active or maintenance' });
    }

    const { rows } = await pool.query(
      'SELECT status FROM shelf_layers WHERE shelf_id = ? AND layer = ?',
      [shelfId, Number(layer)]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Layer not found' });
    if (status !== undefined && rows[0].status === 'busy') {
      return res.status(409).json({ success: false, error: 'Cannot change status of a busy layer' });
    }

    const sets = [];
    const params = [];
    if (status !== undefined)    { sets.push('status = ?');     params.push(status); }
    if (maxWeight !== undefined) { sets.push('max_weight = ?'); params.push(Number(maxWeight)); }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(shelfId, Number(layer));

    await pool.query(
      `UPDATE shelf_layers SET ${sets.join(', ')} WHERE shelf_id = ? AND layer = ?`,
      params
    );
    res.json({ success: true });
  } catch (err) { handleError(res, err); }
});

/** GET /api/robot/events?limit=20 */
router.get('/events', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const { rows } = await pool.query(
      'SELECT * FROM robot_events ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    res.json({ success: true, data: rows });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
