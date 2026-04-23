'use strict';

const { pool } = require('../config/db');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeError(message, httpStatus, code) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  if (code) err.code = code;
  return err;
}

function validateId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) {
    throw makeError('Invalid task id', 400);
  }
  return n;
}

function validateCreatePayload(data) {
  const hasShelf = data.shelfId && data.shelfLayer != null;

  for (const field of ['pickupLocationId', 'destinationId', 'receiverName']) {
    if (!data[field] || String(data[field]).trim() === '') {
      throw makeError(`${field} is required`, 400);
    }
  }
  if (hasShelf) {
    const layer = Number(data.shelfLayer);
    if (!Number.isInteger(layer) || layer < 1) {
      throw makeError('shelfLayer must be a positive integer', 400);
    }
    if (!data.verificationCode || String(data.verificationCode).trim().length < 4) {
      throw makeError('verificationCode must be at least 4 characters', 400);
    }
  }
}

/** Must be called with an open transaction client. */
async function addTimelineEntry(client, taskId, status, note = null) {
  await client.query(
    'INSERT INTO task_timeline (task_id, status, note) VALUES ($1, $2, $3)',
    [taskId, status, note]
  );
}

// Columns returned to callers — verification_code is intentionally excluded.
const TASK_COLUMNS = `
  id, pickup_location_id, destination_id, shelf_id, shelf_layer,
  receiver_name, status, pickup_verified_at, delivery_verified_at,
  cancelled_at, created_at, updated_at
`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new delivery task.
 * Atomically claims the shelf layer and inserts the task + first timeline entry.
 */
async function createTask(data) {
  validateCreatePayload(data);

  const {
    pickupLocationId,
    destinationId,
    shelfId,
    shelfLayer,
    verificationCode,
    receiverName,
  } = data;
  const layer = Number(shelfLayer);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasShelf = shelfId && layer;

    if (hasShelf) {
      // Ensure the shelf_layers row exists, then lock it for this transaction.
      await client.query(
        `INSERT INTO shelf_layers (shelf_id, layer)
         VALUES ($1, $2)
         ON CONFLICT (shelf_id, layer) DO NOTHING`,
        [shelfId, layer]
      );

      const { rows: layerRows } = await client.query(
        `SELECT * FROM shelf_layers WHERE shelf_id = $1 AND layer = $2`,
        [shelfId, layer]
      );

      if (layerRows[0].status === 'busy') {
        throw makeError('Shelf layer is already in use by another task', 409, 'SHELF_LAYER_BUSY');
      }

      await client.query(
        `UPDATE shelf_layers SET status = 'busy', updated_at = NOW()
         WHERE shelf_id = $1 AND layer = $2`,
        [shelfId, layer]
      );
    }

    // Insert the task.
    const { rows: taskRows } = await client.query(
      `INSERT INTO tasks
         (pickup_location_id, destination_id, shelf_id, shelf_layer,
          verification_code, receiver_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'waiting')
       RETURNING ${TASK_COLUMNS}`,
      [
        pickupLocationId.trim(),
        destinationId.trim(),
        hasShelf ? shelfId.trim() : null,
        hasShelf ? layer : null,
        verificationCode ? verificationCode.trim() : null,
        receiverName.trim(),
      ]
    );

    const task = taskRows[0];
    await addTimelineEntry(client, task.id, 'waiting', 'Task created');

    await client.query('COMMIT');
    return task;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * List delivery tasks with optional filtering and pagination.
 * @param {object} filters  { status?, shelfId?, limit?, offset? }
 */
async function listTasks(filters = {}) {
  const { status, shelfId } = filters;
  const limit  = Math.min(Number(filters.limit)  || 50,  200);
  const offset = Math.max(Number(filters.offset) || 0,   0);

  const conditions = [];
  const params = [];
  let i = 1;

  if (status)  { conditions.push(`status = $${i++}`);   params.push(status); }
  if (shelfId) { conditions.push(`shelf_id = $${i++}`); params.push(shelfId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [{ rows: tasks }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT ${TASK_COLUMNS}
         FROM tasks
       ${where}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) AS total FROM tasks ${where}`, params),
  ]);

  return { tasks, total: Number(countRows[0].total) };
}

/**
 * Get a single task with its full timeline.
 */
async function getTaskById(id) {
  const taskId = validateId(id);

  const { rows: taskRows } = await pool.query(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1`,
    [taskId]
  );

  if (!taskRows.length) {
    throw makeError('Task not found', 404);
  }

  const { rows: timeline } = await pool.query(
    `SELECT id, status, note, created_at
       FROM task_timeline
      WHERE task_id = $1
      ORDER BY created_at ASC, id ASC`,
    [taskId]
  );

  return { ...taskRows[0], timeline };
}

/**
 * Cancel a task. Only allowed when status is 'waiting'.
 * Atomically updates the task, releases the shelf layer, and writes a timeline entry.
 */
async function cancelTask(id) {
  const taskId = validateId(id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: taskRows } = await client.query(
      'SELECT * FROM tasks WHERE id = $1',
      [taskId]
    );

    if (!taskRows.length) {
      throw makeError('Task not found', 404);
    }

    const task = taskRows[0];

    if (task.status !== 'waiting') {
      throw makeError(
        `Cannot cancel task with status '${task.status}'. Only 'waiting' tasks can be cancelled.`,
        409,
        'TASK_NOT_CANCELLABLE'
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE tasks
          SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
        WHERE id = $1
       RETURNING ${TASK_COLUMNS}`,
      [taskId]
    );

    await client.query(
      `UPDATE shelf_layers
          SET status = 'active', updated_at = NOW()
        WHERE shelf_id = $1 AND layer = $2`,
      [task.shelf_id, task.shelf_layer]
    );

    await addTimelineEntry(client, taskId, 'cancelled', 'Cancelled via API');

    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Update a task's status and add a timeline entry.
 * Also releases the shelf layer when task reaches a terminal state.
 */
async function updateTaskStatus(id, newStatus, note = null) {
  const taskId = validateId(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Also stamp cancelled_at when transitioning to 'cancelled'
    const cancelledSet = newStatus === 'cancelled' ? ', cancelled_at = NOW()' : '';

    const { rows } = await client.query(
      `UPDATE tasks
          SET status = $1, updated_at = NOW()${cancelledSet}
        WHERE id = $2
       RETURNING *`,
      [newStatus, taskId]
    );

    if (!rows.length) throw makeError('Task not found', 404);

    await addTimelineEntry(client, taskId, newStatus, note);

    // Release the shelf layer when task reaches a terminal state
    if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
      const task = rows[0];
      if (task.shelf_id && task.shelf_layer) {
        await client.query(
          `UPDATE shelf_layers
              SET status = 'active', updated_at = NOW()
            WHERE shelf_id = $1 AND layer = $2`,
          [task.shelf_id, task.shelf_layer]
        );
      }
    }

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify the sender's code at pickup.
 * Sets pickup_verified_at; task remains in_progress.
 * Returns the updated task (verification_code excluded).
 */
async function verifyPickup(id, code) {
  const taskId = validateId(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!rows.length) throw makeError('Task not found', 404);

    const task = rows[0];
    if (task.status !== 'in_progress') {
      throw makeError(`Cannot verify pickup for task with status '${task.status}'`, 409);
    }
    if (task.pickup_verified_at) {
      throw makeError('Pickup already verified', 409);
    }
    if (String(task.verification_code).trim() !== String(code).trim()) {
      throw makeError('Incorrect verification code', 400, 'WRONG_CODE');
    }

    const { rows: updated } = await client.query(
      `UPDATE tasks SET pickup_verified_at = NOW(), updated_at = NOW()
         WHERE id = $1 RETURNING ${TASK_COLUMNS}`,
      [taskId]
    );

    await addTimelineEntry(client, taskId, 'in_progress', 'Pickup verified by sender');

    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Verify the receiver's code at delivery.
 * Sets delivery_verified_at, marks task completed, releases shelf layer.
 */
async function verifyDelivery(id, code) {
  const taskId = validateId(id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (!rows.length) throw makeError('Task not found', 404);

    const task = rows[0];
    if (task.status !== 'in_progress') {
      throw makeError(`Cannot verify delivery for task with status '${task.status}'`, 409);
    }
    if (task.delivery_verified_at) {
      throw makeError('Delivery already verified', 409);
    }
    if (String(task.verification_code).trim() !== String(code).trim()) {
      throw makeError('Incorrect verification code', 400, 'WRONG_CODE');
    }

    const { rows: updated } = await client.query(
      `UPDATE tasks
          SET delivery_verified_at = NOW(), status = 'completed', updated_at = NOW()
        WHERE id = $1 RETURNING ${TASK_COLUMNS}`,
      [taskId]
    );

    await addTimelineEntry(client, taskId, 'completed', 'Delivery verified by receiver');

    // Release the shelf layer
    if (task.shelf_id && task.shelf_layer) {
      await client.query(
        `UPDATE shelf_layers SET status = 'active', updated_at = NOW()
           WHERE shelf_id = $1 AND layer = $2`,
        [task.shelf_id, task.shelf_layer]
      );
    }

    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createTask, listTasks, getTaskById, cancelTask, updateTaskStatus, verifyPickup, verifyDelivery };
