'use strict';

const robotService    = require('../services/robotService');
const taskService     = require('../services/taskService');
const settingsService = require('../services/settingsService');

const STATUS_INTERVAL_MS = 500; // broadcast every 0.5 second

// ---------------------------------------------------------------------------
// Task runner — drives a single task through pickup → delivery
// ---------------------------------------------------------------------------

const runner = {
  taskId:              null,
  // Phases:
  //   'going_to_pickup'       – robot en route to pickup location
  //   'at_pickup'             – robot arrived, waiting for sender verification
  //   'going_to_destination'  – robot en route to delivery location
  //   'at_destination'        – robot arrived, waiting for receiver verification
  phase:               null,
  prevCommandState:    null,
  prevCommandId:       null,  // commandId seen on the previous status tick
  commandId:           null,  // commandId of the last move command WE issued
  watchdogTicks:       0,     // consecutive ticks where commandId doesn't match ours
  paused:              false, // true while task is paused (robot stopped mid-task)
  pickupTimeoutHandle:   null,
  deliveryTimeoutHandle: null,
  // Cached task data needed across phases
  destinationId:       null,
  pickupLocationId:    null,
  taskIdAtPickup:      null, // guard against stale timer firing
};

// Module-level io reference (set by initSocket)
let _io = null;

// ---------------------------------------------------------------------------
// Public query helpers
// ---------------------------------------------------------------------------

/** Returns true when a task is being driven by the runner. */
function isTaskActive() {
  return runner.taskId !== null;
}

// ---------------------------------------------------------------------------
// Public callbacks — called by the tasks route after successful verification
// ---------------------------------------------------------------------------

/** Called by POST /api/tasks/:id/verify-pickup after DB update succeeds. */
function onPickupVerified(taskId) {
  if (!_io || runner.taskId !== taskId || runner.phase !== 'at_pickup') return;

  clearTimeout(runner.pickupTimeoutHandle);
  runner.pickupTimeoutHandle = null;

  console.log(`[TaskRunner] Task #${taskId} → pickup verified, moving to destination`);

  robotService.moveToLocation(runner.destinationId).then((result) => {
    runner.commandId = result.commandId;
    runner.phase     = 'going_to_destination';
    _io.emit('task:updated', { taskId, status: 'in_progress', phase: 'going_to_destination' });
    console.log(`[TaskRunner] Task #${taskId} → moving to destination (${runner.destinationId})`);
  }).catch(err => {
    console.error('[TaskRunner] moveToLocation after pickup verify failed:', err.message);
  });
}

/** Called by POST /api/tasks/:id/verify-delivery after DB update succeeds. */
function onDeliveryVerified(taskId) {
  if (!_io || runner.taskId !== taskId) return;

  clearTimeout(runner.deliveryTimeoutHandle);
  runner.deliveryTimeoutHandle = null;

  console.log(`[TaskRunner] Task #${taskId} → delivery verified, task complete`);
  resetRunner();
}

// ---------------------------------------------------------------------------
// Socket initialisation
// ---------------------------------------------------------------------------

/**
 * Attach Socket.io event handlers and start the status + task-runner loop.
 * @param {import('socket.io').Server} io
 */
function initSocket(io) {
  _io = io;

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Immediately push a status snapshot to the newly connected client
    pushStatus(socket);

    // -----------------------------------------------------------------------
    // Per-user notification rooms
    // Client emits: { taskId: number, role: 'sender' | 'receiver' }
    // Server joins the socket to room  task:<taskId>:<role>
    // -----------------------------------------------------------------------
    socket.on('user:join_task', ({ taskId, role }) => {
      if (!taskId || !['sender', 'receiver'].includes(role)) return;
      const room = `task:${taskId}:${role}`;
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined room ${room}`);
    });

    socket.on('user:leave_task', ({ taskId, role }) => {
      if (!taskId || !['sender', 'receiver'].includes(role)) return;
      socket.leave(`task:${taskId}:${role}`);
    });

    // -----------------------------------------------------------------------
    // Robot control events (triggered from the UI)
    // move / dock / undock / return-home are blocked while a task is active.
    // pause / resume / emergency-stop are always allowed.
    // -----------------------------------------------------------------------

    socket.on('robot:move', async ({ locationId, ttsOnSuccess }) => {
      if (runner.taskId !== null) {
        return socket.emit('error', {
          message: 'A task is currently in progress. Use pause or emergency stop to interrupt.',
        });
      }
      try {
        if (!locationId) return socket.emit('error', { message: 'locationId is required' });
        const result = await robotService.moveToLocation(locationId, { ttsOnSuccess });
        io.emit('robot:command_started', { commandId: result.commandId, locationId });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('robot:pause', async () => {
      // Set paused flag BEFORE the async cancel so the status loop can't
      // misfire handleArrival on the RUNNING→PENDING transition caused by the cancel.
      if (runner.taskId) runner.paused = true;
      try {
        const result = await robotService.pauseRobot();
        io.emit('robot:paused', result);
      } catch (err) {
        if (runner.taskId) runner.paused = false; // revert on failure
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('robot:resume', async () => {
      try {
        if (runner.taskId && runner.paused) {
          // Task-runner managed pause — re-issue the appropriate move command
          const data = await resumeRunner();
          io.emit('robot:command_started', { commandId: data.commandId, resumed: true });
        } else {
          const result = await robotService.resumeRobot();
          io.emit('robot:command_started', { commandId: result.commandId, resumed: true });
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('robot:emergency_stop', async () => {
      try {
        await robotService.emergencyStop();
        // Emergency stop aborts the current task
        if (runner.taskId) {
          const taskId = runner.taskId;
          resetRunner();
          io.emit('task:cancelled', { taskId, reason: 'emergency_stop' });
        }
        io.emit('robot:emergency_stop', {});
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('robot:get_status', async () => {
      await pushStatus(socket);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // -------------------------------------------------------------------------
  // Main loop — every 0.5 seconds
  // -------------------------------------------------------------------------
  setInterval(async () => {
    if (io.engine.clientsCount === 0) return;
    try {
      const status = await robotService.getRobotStatus();

      // 1. Broadcast full status + runner phase to all clients
      io.emit('robot:status', {
        ...status,
        runner: {
          taskId:           runner.taskId,
          phase:            runner.phase,
          paused:           runner.paused,
          pickupLocationId: runner.pickupLocationId,
          destinationId:    runner.destinationId,
        },
      });

      // 2. Run task state machine
      await runTaskMachine(io, status);

    } catch (err) {
      console.warn('[Socket] Loop error:', err.message);
    }
  }, STATUS_INTERVAL_MS);

  console.log(`[Socket] Broadcasting every ${STATUS_INTERVAL_MS}ms`);
}

// ---------------------------------------------------------------------------
// Task state machine
// ---------------------------------------------------------------------------

async function runTaskMachine(io, status) {
  const commandState = status.command?.state;
  const commandId    = status.command?.commandId;

  // If no active task and robot is idle, look for the next waiting task
  if (!runner.taskId && commandState === 'COMMAND_STATE_PENDING') {
    const { tasks } = await taskService.listTasks({ status: 'waiting', limit: 1 });
    if (tasks.length > 0) {
      await startPickup(io, tasks[0]);
    }
  }

  const movingPhases = ['going_to_pickup', 'going_to_destination'];

  // Watchdog: if in a moving phase (not paused) and the current command on
  // the robot no longer matches the one we issued, someone replaced it.
  // After a grace period we re-issue our move command.
  if (
    runner.taskId &&
    movingPhases.includes(runner.phase) &&
    !runner.paused &&
    runner.commandId &&
    commandId !== runner.commandId
  ) {
    runner.watchdogTicks++;
    if (runner.watchdogTicks >= 4) {
      const locationId = runner.phase === 'going_to_destination'
        ? runner.destinationId
        : runner.pickupLocationId;
      console.warn(
        `[TaskRunner] Task #${runner.taskId} — command replaced ` +
        `(expected ${runner.commandId}, got ${commandId}), re-issuing move to ${locationId}`
      );
      try {
        const result = await robotService.moveToLocation(locationId);
        runner.commandId     = result.commandId;
        runner.watchdogTicks = 0;
      } catch (err) {
        console.error('[TaskRunner] Watchdog re-issue failed:', err.message);
      }
    }
  } else {
    runner.watchdogTicks = 0;
  }

  // Arrival detection: RUNNING → PENDING transition while in a moving phase.
  // Extra guards:
  //   - not paused (pause cancels the command, causing a spurious RUNNING→PENDING)
  //   - the command that just completed was the one WE issued (not a rogue command)
  const ourCommandCompleted =
    !runner.commandId ||
    (runner.prevCommandId === runner.commandId && commandId === runner.commandId);

  if (
    runner.taskId &&
    movingPhases.includes(runner.phase) &&
    !runner.paused &&
    runner.prevCommandState === 'COMMAND_STATE_RUNNING' &&
    commandState            === 'COMMAND_STATE_PENDING' &&
    ourCommandCompleted
  ) {
    await handleArrival(io);
  }

  runner.prevCommandState = commandState;
  runner.prevCommandId    = commandId;
}

/** Dispatch the robot to the pickup location and mark the task in_progress. */
async function startPickup(io, task) {
  try {
    await taskService.updateTaskStatus(task.id, 'in_progress', 'Robot dispatched to pickup');
    const { commandId } = await robotService.moveToLocation(task.pickup_location_id);

    runner.taskId            = task.id;
    runner.phase             = 'going_to_pickup';
    runner.commandId         = commandId;
    runner.destinationId     = task.destination_id;
    runner.pickupLocationId  = task.pickup_location_id;

    io.emit('task:updated', {
      taskId: task.id,
      status: 'in_progress',
      phase:  'going_to_pickup',
    });

    console.log(`[TaskRunner] Task #${task.id} → moving to pickup (${task.pickup_location_id})`);
  } catch (err) {
    console.error('[TaskRunner] startPickup error:', err.message);
  }
}

/** Called when the robot finishes a movement command. */
async function handleArrival(io) {
  const { taskId, phase } = runner;

  try {
    if (phase === 'going_to_pickup') {
      const task = await taskService.getTaskById(taskId);
      const needsVerification = !!task.shelf_id;

      if (!needsVerification) {
        // No shelf — skip pickup verification, go straight to destination
        console.log(`[TaskRunner] Task #${taskId} → arrived at pickup (no shelf), moving to destination`);
        const { commandId } = await robotService.moveToLocation(runner.destinationId);
        runner.commandId = commandId;
        runner.phase     = 'going_to_destination';
        io.emit('task:updated', { taskId, status: 'in_progress', phase: 'going_to_destination' });
        return;
      }

      console.log(`[TaskRunner] Task #${taskId} → arrived at pickup, waiting for sender verification`);
      runner.phase = 'at_pickup';

      io.to(`task:${taskId}:sender`).emit('notification', {
        type:    'pickup_arrived',
        taskId,
        title:   'Robot arrived at pickup',
        message: 'Please load the package and enter the verification code.',
      });

      io.emit('task:updated', { taskId, status: 'in_progress', phase: 'at_pickup' });
      await startPickupTimeout(io, taskId);

    } else if (phase === 'going_to_destination') {
      const task = await taskService.getTaskById(taskId);
      const needsVerification = !!task.shelf_id;

      if (!needsVerification) {
        // No shelf — auto-complete on arrival
        console.log(`[TaskRunner] Task #${taskId} → arrived at destination (no shelf), completing`);
        await taskService.updateTaskStatus(taskId, 'completed', 'Arrived at destination');
        io.emit('task:updated', { taskId, status: 'completed', phase: 'completed' });
        resetRunner();
        return;
      }

      console.log(`[TaskRunner] Task #${taskId} → arrived at destination, waiting for receiver verification`);
      runner.phase = 'at_destination';

      io.to(`task:${taskId}:receiver`).emit('notification', {
        type:    'delivery_arrived',
        taskId,
        title:   'Package at destination',
        message: 'Your package has arrived. Please collect it and enter the verification code.',
      });

      io.emit('task:updated', { taskId, status: 'in_progress', phase: 'at_destination' });
      await startDeliveryTimeout(io, taskId);
    }
  } catch (err) {
    console.error('[TaskRunner] handleArrival error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Timeout helpers
// ---------------------------------------------------------------------------

async function startPickupTimeout(io, taskId) {
  const { pickupTimeoutSeconds } = await settingsService.getSettings();
  const ms = pickupTimeoutSeconds * 1000;

  console.log(`[TaskRunner] Pickup timeout set: ${pickupTimeoutSeconds}s for task #${taskId}`);

  runner.pickupTimeoutHandle = setTimeout(async () => {
    if (runner.taskId !== taskId || runner.phase !== 'at_pickup') return;

    console.warn(`[TaskRunner] Pickup timeout fired for task #${taskId} — cancelling`);

    try {
      await taskService.updateTaskStatus(taskId, 'cancelled', 'Pickup timeout — sender did not verify');

      io.to(`task:${taskId}:sender`).emit('notification', {
        type:    'pickup_timeout',
        taskId,
        title:   'Pickup timeout',
        message: 'Verification code was not entered in time. Task has been cancelled.',
      });

      io.emit('task:updated', { taskId, status: 'cancelled', phase: 'pickup_timeout' });
      io.emit('task:cancelled', { taskId, reason: 'pickup_timeout' });

      console.log(`[TaskRunner] Task #${taskId} cancelled due to pickup timeout`);
    } catch (err) {
      console.error('[TaskRunner] pickup timeout cancel error:', err.message);
    } finally {
      resetRunner();
    }
  }, ms);
}

async function startDeliveryTimeout(io, taskId) {
  const { deliveryTimeoutSeconds } = await settingsService.getSettings();
  const ms = deliveryTimeoutSeconds * 1000;

  console.log(`[TaskRunner] Delivery timeout set: ${deliveryTimeoutSeconds}s for task #${taskId}`);

  runner.deliveryTimeoutHandle = setTimeout(async () => {
    if (runner.taskId !== taskId || runner.phase !== 'at_destination') return;

    console.warn(`[TaskRunner] Delivery timeout fired for task #${taskId} — alerting admin`);

    try {
      await taskService.updateTaskStatus(taskId, 'cancelled', 'Delivery timeout — receiver did not verify');

      io.emit('task:timeout_alert', {
        type:    'delivery_timeout',
        taskId,
        title:   'Delivery timeout',
        message: `Task #${taskId} cancelled — receiver did not verify in time.`,
      });
      io.emit('task:updated', { taskId, status: 'cancelled', phase: 'delivery_timeout' });
      io.emit('task:cancelled', { taskId, reason: 'delivery_timeout' });

      console.log(`[TaskRunner] Task #${taskId} cancelled due to delivery timeout`);
    } catch (err) {
      console.error('[TaskRunner] delivery timeout cancel error:', err.message);
    } finally {
      resetRunner();
    }
  }, ms);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetRunner() {
  clearTimeout(runner.pickupTimeoutHandle);
  clearTimeout(runner.deliveryTimeoutHandle);
  runner.taskId              = null;
  runner.phase               = null;
  runner.commandId           = null;
  runner.prevCommandId       = null;
  runner.watchdogTicks       = 0;
  runner.paused              = false;
  runner.destinationId       = null;
  runner.pickupLocationId    = null;
  runner.pickupTimeoutHandle   = null;
  runner.deliveryTimeoutHandle = null;
  runner.prevCommandState    = 'COMMAND_STATE_PENDING';
}

async function pushStatus(socket) {
  try {
    const status = await robotService.getRobotStatus();
    socket.emit('robot:status', {
      ...status,
      runner: {
        taskId:           runner.taskId,
        phase:            runner.phase,
        paused:           runner.paused,
        pickupLocationId: runner.pickupLocationId,
        destinationId:    runner.destinationId,
      },
    });
  } catch (err) {
    socket.emit('error', { message: `Could not fetch robot status: ${err.message}` });
  }
}

// ---------------------------------------------------------------------------
// resumeRunner — re-issue move command after a task-runner pause
// ---------------------------------------------------------------------------

async function resumeRunner() {
  if (!runner.taskId) {
    throw Object.assign(new Error('No active task to resume'), { httpStatus: 409 });
  }
  if (!runner.paused) {
    throw Object.assign(new Error('Task runner is not paused'), { httpStatus: 409 });
  }

  const locationId = runner.phase === 'going_to_destination'
    ? runner.destinationId
    : runner.pickupLocationId;

  const result = await robotService.moveToLocation(locationId);
  runner.commandId     = result.commandId;
  runner.watchdogTicks = 0;
  runner.paused        = false;

  if (_io) {
    _io.emit('task:updated', { taskId: runner.taskId, status: 'in_progress', phase: runner.phase });
  }

  console.log(`[TaskRunner] Task #${runner.taskId} → resumed, re-issued move (phase: ${runner.phase})`);
  return { commandId: result.commandId, taskId: runner.taskId, phase: runner.phase };
}

// ---------------------------------------------------------------------------
// Resume a stuck in_progress task — re-issues the move command
// ---------------------------------------------------------------------------

async function resumeTask(taskId) {
  const id = Number(taskId);

  if (runner.taskId && runner.taskId !== id) {
    const err = new Error('Another task is currently being executed by the runner');
    err.httpStatus = 409;
    throw err;
  }

  const task = await taskService.getTaskById(id);

  if (task.status !== 'in_progress') {
    const err = new Error(`Cannot resume task with status '${task.status}'`);
    err.httpStatus = 409;
    throw err;
  }

  runner.taskId           = id;
  runner.destinationId    = task.destination_id;
  runner.pickupLocationId = task.pickup_location_id;
  runner.paused           = false;

  const goToDestination = !!task.pickup_verified_at;

  if (goToDestination) {
    const result = await robotService.moveToLocation(task.destination_id);
    runner.commandId = result.commandId;
    runner.phase     = 'going_to_destination';
    console.log(`[TaskRunner] Task #${id} → resumed, moving to destination (${task.destination_id})`);
  } else {
    const result = await robotService.moveToLocation(task.pickup_location_id);
    runner.commandId = result.commandId;
    runner.phase     = 'going_to_pickup';
    console.log(`[TaskRunner] Task #${id} → resumed, moving to pickup (${task.pickup_location_id})`);
  }

  if (_io) {
    _io.emit('task:updated', { taskId: id, status: 'in_progress', phase: runner.phase });
  }

  return { taskId: id, phase: runner.phase };
}

module.exports = { initSocket, onPickupVerified, onDeliveryVerified, resumeTask, isTaskActive, resumeRunner };
