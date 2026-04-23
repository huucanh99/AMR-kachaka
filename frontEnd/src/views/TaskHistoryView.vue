<template>
  <div class="content">
    <div class="card">
      <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap;">
        <select v-model="filterStatus" style="width:auto;padding:6px 10px;">
          <option value="">Status: All</option>
          <option value="waiting">Waiting</option>
          <option value="in_progress">Running</option>
          <option value="completed">Done</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
        </select>
        <input type="text" v-model="searchQuery" placeholder="Search by Task ID…" style="width:180px;padding:6px 10px;" />
      </div>

      <div v-if="loading" style="color:#aaa;font-size:13px;">Loading…</div>

      <div v-else style="overflow-x:auto;">
        <table style="min-width:500px;">
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Pickup</th>
              <th>Destination</th>
              <th>Receiver</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in filteredTasks" :key="task.id"
                @click="selectTask(task)"
                style="cursor:pointer;"
                :style="selectedTask?.id === task.id ? 'background:#f0f6ff' : ''">
              <td class="task-link">#{{ task.id }}</td>
              <td>{{ task.pickup_location_id }}</td>
              <td>{{ task.destination_id }}</td>
              <td>{{ task.receiver_name }}</td>
              <td><span class="badge" :class="STATUS_MAP[task.status]?.cls">{{ STATUS_MAP[task.status]?.label }}</span></td>
              <td>{{ formatTime(task.created_at) }}</td>
            </tr>
            <tr v-if="filteredTasks.length === 0">
              <td colspan="6" style="color:#aaa;text-align:center;padding:12px;">No tasks found</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="font-size:11px;color:#aaa;margin-top:8px;">Click on a row to view full details · Total: {{ total }}</div>
    </div>

    <!-- Task detail -->
    <div v-if="selectedTask" class="card" style="padding:0;overflow:hidden;">
      <div style="padding:1rem 1.25rem;border-bottom:0.5px solid #e5e5e2;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:14px;font-weight:500;">
          Task detail — <span style="color:#185FA5;">#{{ selectedTask.id }}</span>
        </div>
        <span class="badge" :class="STATUS_MAP[selectedTask.status]?.cls">{{ STATUS_MAP[selectedTask.status]?.label }}</span>
      </div>

      <div v-if="loadingDetail" style="padding:1rem;color:#aaa;font-size:13px;">Loading detail…</div>

      <div v-if="selectedTask?.status === 'in_progress' && !loadingDetail"
           style="padding:0.75rem 1.25rem;border-bottom:0.5px solid #e5e5e2;display:flex;align-items:center;gap:10px;">
        <button class="btn-primary" :disabled="retrying" @click="retryTask" style="font-size:13px;padding:6px 14px;">
          {{ retrying ? 'Sending…' : 'Retry — re-send move command' }}
        </button>
        <span v-if="retryMsg" style="font-size:12px;" :style="retryError ? 'color:#A32D2D' : 'color:#3B6D11'">{{ retryMsg }}</span>
      </div>

      <div v-if="!loadingDetail" class="detail-body">
        <div class="detail-section">
          <div class="detail-section-title">Task info</div>
          <div class="detail-row"><span class="detail-row-label">Pickup</span><span class="detail-row-value">{{ selectedTask.pickup_location_id }}</span></div>
          <div class="detail-row"><span class="detail-row-label">Destination</span><span class="detail-row-value">{{ selectedTask.destination_id }}</span></div>
          <div class="detail-row"><span class="detail-row-label">Receiver</span><span class="detail-row-value">{{ selectedTask.receiver_name }}</span></div>
          <div class="detail-row"><span class="detail-row-label">Shelf layer</span><span class="detail-row-value">Layer {{ selectedTask.shelf_layer }}</span></div>
          <div class="detail-row"><span class="detail-row-label">Created</span><span class="detail-row-value">{{ formatTime(selectedTask.created_at) }}</span></div>
          <div class="detail-row" v-if="selectedTask.cancelled_at"><span class="detail-row-label">Cancelled</span><span class="detail-row-value" style="color:#A32D2D;">{{ formatTime(selectedTask.cancelled_at) }}</span></div>
          <div class="detail-row" v-if="selectedTask.pickup_verified_at"><span class="detail-row-label">Pickup verified</span><span class="detail-row-value" style="color:#3B6D11;">{{ formatTime(selectedTask.pickup_verified_at) }}</span></div>
          <div class="detail-row" v-if="selectedTask.delivery_verified_at"><span class="detail-row-label">Delivered</span><span class="detail-row-value" style="color:#3B6D11;">{{ formatTime(selectedTask.delivery_verified_at) }}</span></div>
        </div>
        <div class="detail-section">
          <div class="detail-section-title">Timeline</div>
          <div v-if="!selectedTask.timeline?.length" style="color:#aaa;font-size:12px;">No timeline entries</div>
          <div v-for="item in selectedTask.timeline" :key="item.id" class="timeline-item">
            <div class="tl-dot" style="background:#639922;"></div>
            <span class="tl-time">{{ formatTime(item.created_at) }}</span>
            <span style="margin-left:6px;">{{ item.status }}<span v-if="item.note" style="color:#aaa;"> — {{ item.note }}</span></span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { listTasks, getTask, resumeTask } from '../api/tasks'

const STATUS_MAP = {
  waiting:     { label: 'Waiting',   cls: 'waiting'   },
  in_progress: { label: 'Running',   cls: 'running'   },
  completed:   { label: 'Done',      cls: 'done'      },
  cancelled:   { label: 'Cancelled', cls: 'cancelled' },
  failed:      { label: 'Failed',    cls: 'failed'    },
}

const filterStatus   = ref('')
const searchQuery    = ref('')
const tasks          = ref([])
const total          = ref(0)
const loading        = ref(false)
const selectedTask   = ref(null)
const loadingDetail  = ref(false)
const retrying       = ref(false)
const retryMsg       = ref('')
const retryError     = ref(false)

function formatTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
}

async function fetchTasks() {
  loading.value = true
  try {
    const params = { limit: 100 }
    if (filterStatus.value) params.status = filterStatus.value
    const r = await listTasks(params)
    tasks.value = r.data.data.tasks
    total.value = r.data.data.pagination.total
  } finally {
    loading.value = false
  }
}

const filteredTasks = computed(() => {
  if (!searchQuery.value) return tasks.value
  const q = searchQuery.value.replace('#', '').trim()
  return tasks.value.filter(t => String(t.id).includes(q))
})

async function retryTask() {
  if (!selectedTask.value) return
  retrying.value  = true
  retryMsg.value  = ''
  retryError.value = false
  try {
    const r = await resumeTask(selectedTask.value.id)
    retryMsg.value = `Command sent — robot moving (${r.data.data.phase.replace(/_/g, ' ')})`
  } catch (e) {
    retryMsg.value  = e.response?.data?.error || e.message
    retryError.value = true
  } finally {
    retrying.value = false
  }
}

async function selectTask(task) {
  retryMsg.value = ''
  retryError.value = false
  loadingDetail.value = true
  selectedTask.value  = task   // show panel immediately with basic info
  try {
    const r = await getTask(task.id)
    selectedTask.value = r.data.data
  } finally {
    loadingDetail.value = false
  }
}

watch(filterStatus, fetchTasks)
onMounted(fetchTasks)
</script>
