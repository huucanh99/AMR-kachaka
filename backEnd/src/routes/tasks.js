'use strict';

const { Router } = require('express');
const taskService  = require('../services/taskService');
const robotSocket  = require('../socket/robotSocket');

const router = Router();

const VALID_STATUSES = ['waiting', 'in_progress', 'completed', 'cancelled', 'failed'];

function handleError(res, err) {
  console.error('[Tasks]', err.message);
  res.status(err.httpStatus || 500).json({ success: false, error: err.message });
}

function emitLog(io, { level = 'INFO', message, taskId = null }) {
  io.emit('log:new', {
    time:   new Date().toISOString(),
    level,
    robot:  'AMR-01',
    message,
    taskId,
  });
}

// ---------------------------------------------------------------------------
// POST /api/tasks  — create a delivery task
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const task = await taskService.createTask(req.body);
    req.io.emit('task:created', { taskId: task.id, status: task.status });
    emitLog(req.io, { message: 'Task created', taskId: task.id });
    res.status(201).json({ success: true, data: task });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// GET /api/tasks  — list tasks with optional filters + pagination
// Query params: ?status=waiting&shelfId=shelf-001&limit=20&offset=0
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const { status, shelfId, limit, offset } = req.query;

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const { tasks, total } = await taskService.listTasks({ status, shelfId, limit, offset });

    const safeLimit  = Math.min(Number(limit)  || 50, 200);
    const safeOffset = Math.max(Number(offset) || 0,  0);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: { total, limit: safeLimit, offset: safeOffset },
      },
    });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// GET /api/tasks/:id  — task detail with full timeline
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    res.json({ success: true, data: task });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// DELETE /api/tasks/:id  — cancel task (only if status = 'waiting')
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const task = await taskService.cancelTask(req.params.id);
    req.io.emit('task:cancelled', { taskId: task.id });
    emitLog(req.io, { level: 'WARN', message: 'Task cancelled', taskId: task.id });
    res.json({ success: true, data: task });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/resume  — re-issue move command for a stuck in_progress task
// ---------------------------------------------------------------------------
router.post('/:id/resume', async (req, res) => {
  try {
    const result = await robotSocket.resumeTask(req.params.id);
    emitLog(req.io, { message: `Task resumed — robot moving (${result.phase})`, taskId: result.taskId });
    res.json({ success: true, data: result });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/verify-pickup  — sender enters code at pickup location
// Body: { code: string }
// ---------------------------------------------------------------------------
router.post('/:id/verify-pickup', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code is required' });

    const task = await taskService.verifyPickup(req.params.id, code);

    // Advance the robot state machine — robot will now move to destination
    robotSocket.onPickupVerified(task.id);

    req.io.emit('task:updated', { taskId: task.id, status: task.status, phase: 'going_to_destination' });
    emitLog(req.io, { message: 'Pickup verified — robot moving to destination', taskId: task.id });
    res.json({ success: true, data: task });
  } catch (err) { handleError(res, err); }
});

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/verify-delivery  — receiver enters code at destination
// Body: { code: string }
// ---------------------------------------------------------------------------
router.post('/:id/verify-delivery', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'code is required' });

    const task = await taskService.verifyDelivery(req.params.id, code);

    // Clear delivery timeout and reset runner
    robotSocket.onDeliveryVerified(task.id);

    req.io.emit('task:updated', { taskId: task.id, status: 'completed', phase: 'delivered' });
    emitLog(req.io, { message: 'Delivery verified — task completed', taskId: task.id });
    req.io.to(`task:${task.id}:receiver`).emit('notification', {
      type:    'delivery_verified',
      taskId:  task.id,
      title:   'Delivery confirmed',
      message: 'Package collected successfully.',
    });
    res.json({ success: true, data: task });
  } catch (err) { handleError(res, err); }
});

module.exports = router;
