<template>
  <div class="content">
    <div class="card">
      <div class="card-title">System logs</div>
      <div style="display:flex;gap:8px;margin-bottom:1rem;flex-wrap:wrap;">
        <select v-model="filterRobot" style="width:auto;padding:6px 10px;">
          <option value="">Robot: All</option>
          <option value="AMR-01">AMR-01</option>
        </select>
        <input type="text" v-model="searchQuery" placeholder="Search logs..." style="flex:1;min-width:140px;padding:6px 10px;" />
      </div>
      <div style="margin-bottom:1rem;">
        <span class="pill all" :class="{ 'active-filter': activeLevel === '' }" @click="setLevel('')">All</span>
        <span class="pill info" :class="{ 'active-filter': activeLevel === 'INFO' }" @click="setLevel('INFO')">INFO</span>
        <span class="pill warn" :class="{ 'active-filter': activeLevel === 'WARN' }" @click="setLevel('WARN')">WARNING</span>
        <span class="pill error" :class="{ 'active-filter': activeLevel === 'ERROR' }" @click="setLevel('ERROR')">ERROR</span>
      </div>

      <div v-if="loading" style="color:#888;padding:1rem 0;">Loading logs...</div>
      <div v-else-if="error" style="color:#e57373;padding:1rem 0;">{{ error }}</div>
      <table v-else>
        <thead>
          <tr>
            <th style="width:140px;">Time</th>
            <th style="width:75px;">Level</th>
            <th style="width:70px;">Robot</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in filteredLogs" :key="log.time + log.message">
            <td style="font-family:monospace;font-size:11px;color:#aaa;">{{ formatTime(log.time) }}</td>
            <td><span class="log-badge" :class="log.level.toLowerCase()">{{ log.level }}</span></td>
            <td style="font-size:12px;color:#888;">{{ log.robot }}</td>
            <td>
              <span v-if="log.taskId">
                {{ log.message }}
                <span class="task-link">#{{ log.taskId }}</span>
              </span>
              <span v-else>{{ log.message }}</span>
            </td>
          </tr>
          <tr v-if="filteredLogs.length === 0">
            <td colspan="4" style="text-align:center;color:#888;padding:1rem;">No logs found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getLogs } from '../api/logs'
import socket from '../socket'

const filterRobot = ref('')
const searchQuery = ref('')
const activeLevel = ref('')
const logs        = ref([])
const loading     = ref(true)
const error       = ref(null)

async function fetchLogs() {
  try {
    error.value = null
    const params = {}
    if (activeLevel.value) params.level = activeLevel.value
    const res = await getLogs({ ...params, limit: 100 })
    logs.value = res.data.data.logs
  } catch (err) {
    error.value = 'Failed to load logs'
    console.error(err)
  } finally {
    loading.value = false
  }
}

function setLevel(level) {
  activeLevel.value = level
  loading.value = true
  fetchLogs()
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const filteredLogs = computed(() => {
  return logs.value.filter(l => {
    const matchRobot  = !filterRobot.value || l.robot === filterRobot.value
    const matchSearch = !searchQuery.value || l.message?.toLowerCase().includes(searchQuery.value.toLowerCase())
    return matchRobot && matchSearch
  })
})

function onNewLog(log) {
  if (!activeLevel.value || log.level === activeLevel.value) {
    logs.value.unshift(log)
  }
}

onMounted(() => {
  fetchLogs()
  socket.on('log:new', onNewLog)
})

onUnmounted(() => {
  socket.off('log:new', onNewLog)
})
</script>
