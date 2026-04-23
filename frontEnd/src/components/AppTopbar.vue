<template>
  <div class="topbar">
    <div class="topbar-title">{{ title }}</div>
    <div class="topbar-right">
      <div class="battery-wrap" :title="batteryStatusLabel">
        <div class="battery-bar">
          <div class="battery-fill" :style="{ width: battery + '%', background: batteryColor }"></div>
        </div>
        {{ battery !== null ? battery + '%' : '—' }}
      </div>
      <span>AMR-01</span>
      <div class="avatar" :title="user?.username">{{ avatarInitials }}</div>
      <button class="logout-btn" @click="logout" title="Sign out">⏻</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import socket from '../socket'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { user, clearAuth } = useAuth()

function logout() {
  clearAuth()
  router.push('/login')
}

const avatarInitials = computed(() => {
  if (!user.value?.username) return '?'
  return user.value.username.slice(0, 2).toUpperCase()
})

const route = useRoute()

const titleMap = {
  'dashboard':       'Dashboard',
  'robot-status':    'Robot status',
  'create-task':     'Create task',
  'task-history':    'Task history',
  'logs':            'Logs',
  'settings':        'Settings',
  'shelf-management':'Shelf management',
}
const title = computed(() => titleMap[route.name] || 'AMR Platform')

const battery     = ref(null)
const batteryStatus = ref('')

const batteryColor = computed(() => {
  if (battery.value === null) return '#ccc'
  if (battery.value <= 20) return '#E24B4A'
  if (battery.value <= 50) return '#EF9F27'
  return '#639922'
})

const batteryStatusLabel = computed(() => {
  const map = {
    POWER_SUPPLY_STATUS_CHARGING:     'Charging',
    POWER_SUPPLY_STATUS_DISCHARGING:  'Discharging',
    POWER_SUPPLY_STATUS_FULL:         'Full',
    POWER_SUPPLY_STATUS_NOT_CHARGING: 'Not charging',
  }
  return map[batteryStatus.value] || ''
})

function onStatus(s) {
  battery.value      = Math.round(s.battery.percentage)
  batteryStatus.value = s.battery.status
}

onMounted(()   => socket.on('robot:status', onStatus))
onUnmounted(() => socket.off('robot:status', onStatus))
</script>

<style scoped>
.logout-btn {
  background: none;
  border: 1px solid #2a2d3e;
  border-radius: 6px;
  color: #888;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  line-height: 1;
  transition: color 0.2s, border-color 0.2s;
}
.logout-btn:hover {
  color: #e57373;
  border-color: #e57373;
}
</style>
