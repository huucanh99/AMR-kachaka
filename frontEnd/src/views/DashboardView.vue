<template>
  <div class="content">
    <!-- Notification toasts -->
    <Teleport to="body">
      <div style="position:fixed;top:16px;right:16px;z-index:2000;display:flex;flex-direction:column;gap:8px;max-width:340px;">
        <div
          v-for="n in notifications" :key="n.id"
          style="background:#fff;border-radius:10px;padding:12px 14px;box-shadow:0 4px 20px rgba(0,0,0,0.15);display:flex;gap:10px;align-items:flex-start;border-left:4px solid;"
          :style="{ borderColor: notifColor(n.type) }"
        >
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;margin-bottom:2px;">{{ n.title }}</div>
            <div style="font-size:12px;color:#666;">{{ n.message }}</div>
            <div style="font-size:11px;color:#aaa;margin-top:4px;">Task #{{ n.taskId }}</div>
          </div>
          <button @click="dismissNotif(n.id)" style="background:none;border:none;cursor:pointer;color:#aaa;font-size:16px;padding:0;line-height:1;">×</button>
        </div>
      </div>
    </Teleport>

    <!-- Floor map + Robot status -->
    <div style="display:grid;grid-template-columns:7fr 3fr;gap:1rem;">
      <div class="card">
        <div class="card-title">Floor map — AMR-01 location</div>
        <div class="map-wrap">
          <div class="map-legend">
            <div class="legend-item">
              <div class="legend-dot" style="background:#378ADD;animation:blink 1s infinite;box-shadow:0 0 5px rgba(55,138,221,0.5);"></div>
              Robot en route
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:#378ADD;box-shadow:0 0 5px rgba(55,138,221,0.5);"></div>
              Robot arrived
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:#e0e0dd;"></div>
              Idle
            </div>
          </div>
          <div class="floor-grid">
            <div class="room" v-for="room in rooms" :key="room.name" :class="{ target: room.target }">
              <div class="room-light" :class="{ on: room.solid, blink: room.blink }"></div>
              <div class="room-name">{{ room.name }}</div>
              <div v-if="room.solid || room.blink" class="robot-icon">AMR-01</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Robot status</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div class="stat">
            <div class="stat-label">State</div>
            <div class="stat-value" style="color:#185FA5;">{{ commandStateLabel(robotStatus?.command?.state) }}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Connection</div>
            <div class="stat-value" :style="{ color: connected ? '#3B6D11' : '#A32D2D' }">
              {{ connected ? 'Connected' : 'Disconnected' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Task queue -->
    <div class="card">
      <div class="card-header">
        <div class="card-title" style="margin-bottom:0;">Task queue</div>
      </div>
      <div v-if="taskQueue.length === 0" style="color:#aaa;font-size:13px;padding:8px 0;">No active tasks</div>
      <table v-else>
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Pickup</th>
            <th>Destination</th>
            <th>Receiver</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in taskQueue" :key="task.id">
            <td class="task-link">#{{ task.id }}</td>
            <td>{{ task.pickup_location_id }}</td>
            <td>{{ task.destination_id }}</td>
            <td>{{ task.receiver_name }}</td>
            <td><span class="badge" :class="STATUS_MAP[task.status]?.cls">{{ STATUS_MAP[task.status]?.label }}</span></td>
            <td>
              <button v-if="task.status === 'waiting'" class="btn-cancel" @click="cancelTask(task.id)">Cancel</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- System log -->
    <div class="card">
      <div class="card-title">System log</div>
      <div v-if="systemLogs.length === 0" style="color:#aaa;font-size:13px;padding:8px 0;">No events yet</div>
      <table v-else>
        <tbody>
          <tr v-for="log in systemLogs" :key="log.id">
            <td style="font-family:monospace;font-size:11px;color:#aaa;width:130px;">{{ formatTime(log.created_at) }}</td>
            <td><span class="log-badge info">{{ log.event_type }}</span></td>
            <td style="padding-left:10px;font-size:12px;">{{ formatPayload(log.payload) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import socket from '../socket'
import { getLocations, getEvents } from '../api/robot'
import { listTasks, cancelTask as apiCancelTask } from '../api/tasks'

// Notifications from server (pickup_arrived / delivery_arrived)
const notifications = ref([])
let notifIdCounter = 0

const NOTIF_COLORS = {
  pickup_arrived:    '#185FA5',
  delivery_arrived:  '#3B6D11',
  delivery_verified: '#3B6D11',
  pickup_timeout:    '#A32D2D',
  delivery_timeout:  '#C47A00',
}

function notifColor(type) {
  return NOTIF_COLORS[type] || '#888'
}

function pushNotification(notif) {
  const id = ++notifIdCounter
  notifications.value.unshift({ id, ...notif })
  // Timeout alerts stay until dismissed; others auto-dismiss after 8 s
  const isAlert = notif.type === 'delivery_timeout' || notif.type === 'pickup_timeout'
  if (!isAlert) {
    setTimeout(() => {
      notifications.value = notifications.value.filter(n => n.id !== id)
    }, 8000)
  }
}

function dismissNotif(id) {
  notifications.value = notifications.value.filter(n => n.id !== id)
}

const STATUS_MAP = {
  waiting:     { label: 'Waiting',   cls: 'waiting'   },
  in_progress: { label: 'Running',   cls: 'running'   },
  completed:   { label: 'Done',      cls: 'done'      },
  cancelled:   { label: 'Cancelled', cls: 'cancelled' },
  failed:      { label: 'Failed',    cls: 'failed'    },
}

const locations   = ref([])
const robotStatus = ref(null)
const connected   = ref(socket.connected)
const allTasks    = ref([])
const systemLogs  = ref([])

const taskQueue = computed(() =>
  allTasks.value.filter(t => ['waiting', 'in_progress'].includes(t.status))
)

// Rooms — highlight based on runner phase
const rooms = computed(() => {
  const runner = robotStatus.value?.runner
  const phase  = runner?.phase

  let solidId  = null  // light on solid
  let blinkId  = null  // light blinking (robot moving toward)

  if (phase === 'going_to_pickup')       blinkId  = runner.pickupLocationId
  else if (phase === 'at_pickup')        solidId  = runner.pickupLocationId
  else if (phase === 'going_to_destination') blinkId = runner.destinationId
  else if (phase === 'at_destination')   solidId  = runner.destinationId

  return locations.value
    .filter(l => l.type !== 'LOCATION_TYPE_CHARGER')
    .map(l => ({
      id:     l.id,
      name:   l.name,
      solid:  l.id === solidId,
      blink:  l.id === blinkId,
      target: l.id === solidId || l.id === blinkId,
    }))
})

function commandStateLabel(state) {
  if (state === 'COMMAND_STATE_RUNNING') return 'Navigating'
  if (state === 'COMMAND_STATE_PENDING') return 'Idle'
  return '—'
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatPayload(payload) {
  if (!payload) return ''
  try { return JSON.stringify(JSON.parse(payload)) } catch { return payload }
}

async function refreshTasks() {
  const r = await listTasks({ limit: 100 })
  allTasks.value = r.data.data.tasks
}

async function cancelTask(id) {
  await apiCancelTask(id)
  await refreshTasks()
}

const FALLBACK_ROOMS = [
  { id: 'loc-503', name: 'Room 503', type: 'LOCATION_TYPE_UNSPECIFIED' },
  { id: 'loc-504', name: 'Room 504', type: 'LOCATION_TYPE_UNSPECIFIED' },
  { id: 'loc-505', name: 'Room 505', type: 'LOCATION_TYPE_UNSPECIFIED' },
  { id: 'loc-601', name: 'Room 601', type: 'LOCATION_TYPE_UNSPECIFIED' },
  { id: 'loc-602', name: 'Room 602', type: 'LOCATION_TYPE_UNSPECIFIED' },
  { id: 'loc-611', name: 'Meeting 611', type: 'LOCATION_TYPE_UNSPECIFIED' },
]

const onConnect        = () => { connected.value = true  }
const onDisconnect     = () => { connected.value = false }
const onRobotStatus    = (s) => { robotStatus.value = s  }
const onTaskCreated    = () => refreshTasks()
const onTaskCancelled  = () => refreshTasks()
const onTaskUpdated    = (data) => {
  refreshTasks()
  if (data?.phase === 'at_pickup') {
    pushNotification({ type: 'pickup_arrived', taskId: data.taskId, title: 'Robot arrived at pickup', message: 'Please load the package and enter the verification code.' })
  }
  if (data?.phase === 'at_destination') {
    pushNotification({ type: 'delivery_arrived', taskId: data.taskId, title: 'Package arrived at destination', message: 'Enter the verification code to confirm delivery.' })
  }
}
const onNotification   = (n) => pushNotification(n)
const onTimeoutAlert   = (n) => pushNotification(n)

onMounted(async () => {
  const [tasksRes, logsRes, locRes] = await Promise.allSettled([
    listTasks({ limit: 100 }),
    getEvents(20),
    getLocations(),
  ])
  if (tasksRes.status === 'fulfilled') allTasks.value   = tasksRes.value.data.data.tasks
  if (logsRes.status  === 'fulfilled') systemLogs.value = logsRes.value.data.data
  locations.value = locRes.status === 'fulfilled' ? locRes.value.data.data : FALLBACK_ROOMS

  socket.on('connect',            onConnect)
  socket.on('disconnect',         onDisconnect)
  socket.on('robot:status',       onRobotStatus)
  socket.on('task:created',       onTaskCreated)
  socket.on('task:cancelled',     onTaskCancelled)
  socket.on('task:updated',       onTaskUpdated)
  socket.on('notification',       onNotification)
  socket.on('task:timeout_alert', onTimeoutAlert)
})

onUnmounted(() => {
  socket.off('connect',            onConnect)
  socket.off('disconnect',         onDisconnect)
  socket.off('robot:status',       onRobotStatus)
  socket.off('task:created',       onTaskCreated)
  socket.off('task:cancelled',     onTaskCancelled)
  socket.off('task:updated',       onTaskUpdated)
  socket.off('notification',       onNotification)
  socket.off('task:timeout_alert', onTimeoutAlert)
})
</script>
