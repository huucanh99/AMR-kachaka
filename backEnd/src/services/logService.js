'use strict';

const { pool } = require('../config/db');

// Map robot_event_type → log level
const EVENT_LEVEL = {
  emergency_stop: 'ERROR',
  pause:          'WARN',
  move_to_location: 'INFO',
};

function eventLevel(type) {
  return EVENT_LEVEL[type] || 'INFO';
}

/**
 * Fetch merged logs from task_timeline + robot_events.
 * @param {object} filters { level?, limit?, offset? }
 */
async function getLogs(filters = {}) {
  const limit  = Math.min(Number(filters.limit)  || 50, 200);
  const offset = Math.max(Number(filters.offset) || 0,  0);

  const [{ rows: timeline }, { rows: events }] = await Promise.all([
    pool.query(
      `SELECT
         tt.id,
         tt.created_at,
         'INFO'       AS level,
         'AMR-01'     AS robot,
         tt.note      AS message,
         tt.status,
         tt.task_id
       FROM task_timeline tt
       ORDER BY tt.created_at DESC
       LIMIT 500`
    ),
    pool.query(
      `SELECT
         re.id,
         re.created_at,
         re.event_type,
         re.payload
       FROM robot_events re
       ORDER BY re.created_at DESC
       LIMIT 500`
    ),
  ]);

  const timelineLogs = timeline.map(r => ({
    time:    r.created_at,
    level:   'INFO',
    robot:   'AMR-01',
    message: r.note || r.status,
    taskId:  r.task_id,
    source:  'task_timeline',
  }));

  const eventLogs = events.map(r => {
    let payload = {};
    try { payload = JSON.parse(r.payload || '{}'); } catch (_) {}
    const level = eventLevel(r.event_type);
    const message = buildEventMessage(r.event_type, payload);
    return {
      time:    r.created_at,
      level,
      robot:   'AMR-01',
      message,
      taskId:  null,
      source:  'robot_events',
    };
  });

  let merged = [...timelineLogs, ...eventLogs]
    .sort((a, b) => new Date(b.time) - new Date(a.time));

  if (filters.level) {
    merged = merged.filter(l => l.level === filters.level);
  }

  const total = merged.length;
  const page  = merged.slice(offset, offset + limit);

  return { logs: page, total };
}

function buildEventMessage(eventType, payload) {
  switch (eventType) {
    case 'move_to_location':
      return `Robot moving to location${payload.locationId ? ` — ${payload.locationId}` : ''}`;
    case 'pause':
      return 'Robot paused';
    case 'emergency_stop':
      return 'Emergency stop triggered';
    default:
      return eventType;
  }
}

module.exports = { getLogs };
