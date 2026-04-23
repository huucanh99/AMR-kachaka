'use strict';

const { call, getRequest } = require('../grpc/kachakaClient');
const { pool } = require('../config/db');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Log a robot event to the database (fire-and-forget). */
function logEvent(event_type, payload = {}) {
  pool.query(
    'INSERT INTO robot_events (event_type, payload) VALUES ($1, $2)',
    [event_type, JSON.stringify(payload)]
  ).catch(err => console.error('[DB] logEvent failed:', err.message));
}

/** Create or update a delivery task row. */
async function upsertTask(taskData) {
  const { id, location_id, location_name, command_id, status } = taskData;
  if (id) {
    const { rows } = await pool.query(
      `UPDATE delivery_tasks
          SET command_id = $1, status = $2, updated_at = NOW()
        WHERE id = $3
       RETURNING *`,
      [command_id, status, id]
    );
    return rows[0];
  }
  const { rows } = await pool.query(
    `INSERT INTO delivery_tasks (location_id, location_name, command_id, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [location_id, location_name || '', command_id || null, status]
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Public service methods
// ---------------------------------------------------------------------------

/**
 * Move the robot to a registered location.
 * @param {string} locationId  - Kachaka location ID
 * @param {object} [opts]
 * @param {boolean} [opts.cancelAll=true]  - cancel any running command first
 * @param {string}  [opts.ttsOnSuccess=''] - TTS text on success
 * @returns {{ task, commandId }}
 */
async function moveToLocation(locationId, opts = {}) {
  const { cancelAll = true, ttsOnSuccess = '' } = opts;

  const response = await call('StartCommand', {
    command: {
      move_to_location_command: { target_location_id: locationId },
    },
    cancel_all: cancelAll,
    tts_on_success: ttsOnSuccess,
  });

  if (!response.result.success) {
    const err = new Error(`StartCommand failed (code ${response.result.error_code})`);
    err.errorCode = response.result.error_code;
    throw err;
  }

  logEvent('move_to_location', { locationId, commandId: response.command_id });
  return { commandId: response.command_id };
}

/**
 * Pause the robot by cancelling the current command.
 * The current destination is saved in the DB so it can be resumed.
 * @returns {{ task }}
 */
async function pauseRobot() {
  // Read current running command before cancelling
  const stateResp = await call('GetCommandState', getRequest());

  const cancelResp = await call('CancelCommand', {});
  if (!cancelResp.result.success) {
    const err = new Error(`CancelCommand failed (code ${cancelResp.result.error_code})`);
    err.errorCode = cancelResp.result.error_code;
    throw err;
  }

  // Mark the running task as paused in DB
  const { rows } = await pool.query(
    `UPDATE delivery_tasks
        SET status = 'paused', paused_at = NOW(), updated_at = NOW()
      WHERE status = 'running'
     RETURNING *`
  );

  logEvent('pause', {
    commandId: stateResp.command_id,
    commandState: stateResp.state,
  });

  return { task: rows[0] || null };
}

/**
 * Resume the last paused task by re-issuing the move command.
 * @returns {{ task, commandId }}
 */
async function resumeRobot() {
  const { rows } = await pool.query(
    `SELECT * FROM delivery_tasks
      WHERE status = 'paused'
      ORDER BY paused_at DESC
      LIMIT 1`
  );

  if (!rows.length) {
    const err = new Error('No paused task to resume');
    err.code = 'NO_PAUSED_TASK';
    throw err;
  }

  const pausedTask = rows[0];
  return moveToLocation(pausedTask.location_id, { cancelAll: false });
}

/**
 * Trigger an emergency stop.
 * Marks all running tasks as failed.
 */
async function emergencyStop() {
  const response = await call('SetEmergencyStop', {});

  if (!response.result.success) {
    const err = new Error(`SetEmergencyStop failed (code ${response.result.error_code})`);
    err.errorCode = response.result.error_code;
    throw err;
  }

  await pool.query(
    `UPDATE delivery_tasks
        SET status = 'failed', updated_at = NOW()
      WHERE status IN ('running', 'paused')`
  );

  logEvent('emergency_stop', {});
  return { success: true };
}

/**
 * Get a composite snapshot of the robot's current status.
 * Aggregates pose, battery, command state, and the active DB task.
 */
async function getRobotStatus() {
  const [poseResp, batteryResp, commandResp, odomResp] = await Promise.all([
    call('GetRobotPose',     getRequest()),
    call('GetBatteryInfo',   getRequest()),
    call('GetCommandState',  getRequest()),
    call('GetRosOdometry',   getRequest()),
  ]);

  // Active task from DB
  const { rows } = await pool.query(
    `SELECT * FROM tasks
      WHERE status IN ('in_progress', 'waiting')
      ORDER BY updated_at DESC
      LIMIT 1`
  );

  const twist = odomResp.odometry?.twist?.twist;
  const vx = twist?.linear?.x || 0;
  const vy = twist?.linear?.y || 0;
  const speed = Math.round(Math.sqrt(vx * vx + vy * vy) * 100) / 100; // m/s, 2 decimal

  return {
    pose: poseResp.pose,
    battery: {
      percentage: batteryResp.remaining_percentage,
      status: batteryResp.power_supply_status,
    },
    command: {
      state: commandResp.state,
      commandId: commandResp.command_id,
    },
    speed,
    activeTask: rows[0] || null,
  };
}

/**
 * List all delivery tasks (newest first).
 * @param {number} [limit=50]
 */
async function listTasks(limit = 50) {
  const { rows } = await pool.query(
    'SELECT * FROM tasks ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}

module.exports = {
  moveToLocation,
  pauseRobot,
  resumeRobot,
  emergencyStop,
  getRobotStatus,
  listTasks,
};
