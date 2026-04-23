<template>
  <div v-if="isAuthPage" class="layout-auth">
    <router-view />
  </div>
  <div v-else class="layout">
    <AppSidebar />
    <div class="main">
      <AppTopbar />
      <router-view />
    </div>
  </div>

  <!-- Global verify-code modal — shows on any page -->
  <Teleport to="body">
    <div v-if="verifyModal.visible"
      style="position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);">
      <div style="background:#fff;border-radius:12px;padding:28px 32px;width:360px;box-shadow:0 8px 40px rgba(0,0,0,0.2);">
        <div style="font-size:16px;font-weight:700;margin-bottom:4px;">
          {{ verifyModal.phase === 'at_pickup' ? 'Pickup verification' : 'Delivery verification' }}
        </div>
        <div style="font-size:13px;color:#666;margin-bottom:16px;">
          {{ verifyModal.phase === 'at_pickup'
            ? 'Robot arrived at pickup. Enter the verification code to load the package.'
            : 'Robot arrived at destination. Enter the verification code to confirm delivery.' }}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:12px;color:#888;">Task #{{ verifyModal.taskId }}</div>
          <div :style="{ fontSize:'13px', fontWeight:'600', color: countdown <= 5 ? '#A32D2D' : '#888' }">
            ⏱ {{ countdown }}s
          </div>
        </div>
        <input
          v-model="verifyCode"
          type="text"
          placeholder="Enter code"
          @keyup.enter="submitVerify"
          style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #ddd;border-radius:8px;font-size:15px;letter-spacing:2px;outline:none;margin-bottom:8px;"
          :style="verifyError ? { borderColor: '#A32D2D' } : {}"
          autofocus
        />
        <div v-if="verifyError" style="font-size:12px;color:#A32D2D;margin-bottom:10px;">{{ verifyError }}</div>
        <button
          @click="submitVerify"
          :disabled="verifyLoading"
          style="width:100%;padding:10px;background:#185FA5;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;"
          :style="verifyLoading ? { opacity:0.6 } : {}">
          {{ verifyLoading ? 'Verifying…' : 'Confirm' }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import socket from './socket'
import { verifyPickup, verifyDelivery } from './api/tasks'
import { getSettings } from './api/settings'

const route = useRoute()
const isAuthPage = computed(() => ['login', 'register'].includes(route.name))

// ---------- Verify modal ----------
const robotStatus  = ref(null)
const verifyModal  = ref({ visible: false, taskId: null, phase: null })
const verifyCode   = ref('')
const verifyError  = ref('')
const verifyLoading = ref(false)
const countdown    = ref(0)
let countdownTimer = null

function startCountdown(seconds) {
  clearInterval(countdownTimer)
  countdown.value = seconds
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) clearInterval(countdownTimer)
  }, 1000)
}

function stopCountdown() {
  clearInterval(countdownTimer)
  countdown.value = 0
}

async function submitVerify() {
  verifyError.value = ''
  if (!verifyCode.value.trim()) { verifyError.value = 'Please enter the code'; return }
  verifyLoading.value = true
  try {
    const { taskId, phase } = verifyModal.value
    if (phase === 'at_pickup')          await verifyPickup(taskId, verifyCode.value.trim())
    else if (phase === 'at_destination') await verifyDelivery(taskId, verifyCode.value.trim())
    verifyModal.value = { visible: false, taskId: null, phase: null }
    verifyCode.value  = ''
    stopCountdown()
  } catch (err) {
    verifyError.value = err.response?.data?.error || 'Incorrect code'
  } finally {
    verifyLoading.value = false
  }
}

watch(
  () => {
    const r = robotStatus.value?.runner
    return r ? `${r.taskId}:${r.phase}` : 'null'
  },
  async (key) => {
    const r = robotStatus.value?.runner
    const phase  = r?.phase
    const taskId = r?.taskId

    if ((phase === 'at_pickup' || phase === 'at_destination') && taskId) {
      verifyCode.value  = ''
      verifyError.value = ''
      verifyModal.value = { visible: true, taskId, phase }
      try {
        const res = await getSettings()
        const secs = phase === 'at_pickup'
          ? res.data.data.pickupTimeoutSeconds
          : res.data.data.deliveryTimeoutSeconds
        startCountdown(secs)
      } catch { startCountdown(15) }
    } else if (!phase) {
      verifyModal.value = { visible: false, taskId: null, phase: null }
      stopCountdown()
    }
  }
)

const onRobotStatus = (s) => { robotStatus.value = s }
const onTaskUpdated = (data) => {
  if (data?.phase === 'pickup_timeout' || data?.phase === 'delivery_timeout' ||
      data?.status === 'cancelled' || data?.status === 'completed') {
    verifyModal.value = { visible: false, taskId: null, phase: null }
    stopCountdown()
  }
}

onMounted(() => {
  socket.on('robot:status',  onRobotStatus)
  socket.on('task:updated',  onTaskUpdated)
  socket.on('task:cancelled', () => { verifyModal.value = { visible: false, taskId: null, phase: null }; stopCountdown() })
})
onUnmounted(() => {
  stopCountdown()
  socket.off('robot:status', onRobotStatus)
  socket.off('task:updated', onTaskUpdated)
})
</script>
