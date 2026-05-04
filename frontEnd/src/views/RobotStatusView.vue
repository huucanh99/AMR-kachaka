<template>
  <div class="content">
    <!-- Robot info -->
    <div class="card">
      <div class="card-title">{{ t('robotStatus.title') }}</div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">{{ t('robotStatus.currentState') }}</div><div class="stat-value" style="color:#185FA5;">{{ commandStateLabel(robotStatus?.command?.state) }}</div></div>
        <div class="stat"><div class="stat-label">{{ t('robotStatus.battery') }}</div><div class="stat-value">{{ robotStatus ? Math.round(robotStatus.battery.percentage) + '%' : '—' }}</div></div>
        <div class="stat"><div class="stat-label">{{ t('robotStatus.speed') }}</div><div class="stat-value">{{ robotStatus ? robotStatus.speed.toFixed(2) + ' m/s' : '—' }}</div></div>
        <div class="stat"><div class="stat-label">{{ t('robotStatus.posX') }}</div><div class="stat-value">{{ robotStatus ? robotStatus.pose.x.toFixed(2) + ' m' : '—' }}</div></div>
        <div class="stat"><div class="stat-label">{{ t('robotStatus.posY') }}</div><div class="stat-value">{{ robotStatus ? robotStatus.pose.y.toFixed(2) + ' m' : '—' }}</div></div>
        <div class="stat"><div class="stat-label">{{ t('robotStatus.activeTask') }}</div><div class="stat-value">{{ robotStatus?.activeTask ? '#' + robotStatus.activeTask.id : t('status.none') }}</div></div>
        <div class="stat"><div class="stat-label">{{ t('common.connection') }}</div><div class="stat-value" :style="{ color: connected ? '#3B6D11' : '#A32D2D' }">{{ connected ? t('common.connected') : t('common.disconnected') }}</div></div>
      </div>
      <div style="font-size:11px;color:#aaa;margin-top:8px;">{{ t('robotStatus.liveUpdate') }}</div>
    </div>

    <!-- Controls -->
    <div class="card">
      <div class="card-title">{{ t('robotStatus.controls') }}</div>
      <div v-if="errorMsg" style="color:#A32D2D;font-size:13px;margin-bottom:8px;">{{ errorMsg }}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="ctrl-btn" :disabled="loading" @click="activeDialog = 'pause'">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="4" y="3" width="3" height="10" rx="1"/>
            <rect x="9" y="3" width="3" height="10" rx="1"/>
          </svg>
          {{ t('robotStatus.pause') }}
        </button>
        <button class="ctrl-btn" :disabled="loading" @click="activeDialog = 'resume'">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <polygon points="4,3 13,8 4,13"/>
          </svg>
          {{ t('robotStatus.resume') }}
        </button>
        <button class="ctrl-btn" :disabled="loading" @click="activeDialog = 'dockShelf'">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="5" width="12" height="8" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><line x1="8" y1="7" x2="8" y2="9"/><line x1="6" y1="8" x2="10" y2="8"/>
          </svg>
          {{ t('robotStatus.dockShelf') }}
        </button>
        <button class="ctrl-btn" :disabled="loading" @click="activeDialog = 'undockShelf'">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="5" width="12" height="8" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><line x1="8" y1="9" x2="8" y2="11"/><line x1="6" y1="10" x2="10" y2="10"/>
          </svg>
          {{ t('robotStatus.undockShelf') }}
        </button>
        <button class="ctrl-btn" :disabled="loading" @click="activeDialog = 'returnHome'">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M13 8A5 5 0 1 1 8 3"/><polyline points="13 3 13 8 8 8"/>
          </svg>
          {{ t('robotStatus.returnHome') }}
        </button>
        <button class="ctrl-btn danger" :disabled="loading" @click="activeDialog = 'estop'">
          <svg viewBox="0 0 16 16" fill="none" stroke="#A32D2D" stroke-width="1.5">
            <circle cx="8" cy="8" r="6"/>
            <line x1="8" y1="5" x2="8" y2="9"/>
          </svg>
          {{ t('robotStatus.estop') }}
        </button>
      </div>
    </div>

    <!-- Modal overlay -->
    <Teleport to="body">
      <div v-if="activeDialog" class="modal-overlay" @click.self="activeDialog = null">
        <div class="modal">

          <!-- Pause -->
          <template v-if="activeDialog === 'pause'">
            <div class="modal-icon" style="background:#E6F1FB;">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#185FA5" stroke-width="1.5">
                <rect x="4" y="3" width="3" height="10" rx="1"/>
                <rect x="9" y="3" width="3" height="10" rx="1"/>
              </svg>
            </div>
            <div class="modal-title">{{ t('robotStatus.modal.pause.title') }}</div>
            <div class="modal-desc">{{ t('robotStatus.modal.pause.desc') }}</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="activeDialog = null">{{ t('common.cancel') }}</button>
              <button class="btn-blue" :disabled="loading" @click="confirmAction('pause')">
                {{ loading ? t('common.wait') : t('robotStatus.modal.pause.confirm') }}
              </button>
            </div>
          </template>

          <!-- Resume -->
          <template v-else-if="activeDialog === 'resume'">
            <div class="modal-icon" style="background:#EAF3DE;">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#3B6D11" stroke-width="1.5">
                <polygon points="4,3 13,8 4,13"/>
              </svg>
            </div>
            <div class="modal-title">{{ t('robotStatus.modal.resume.title') }}</div>
            <div class="modal-desc">{{ t('robotStatus.modal.resume.desc') }}</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="activeDialog = null">{{ t('common.cancel') }}</button>
              <button class="btn-blue" :disabled="loading" @click="confirmAction('resume')">
                {{ loading ? t('common.wait') : t('robotStatus.modal.resume.confirm') }}
              </button>
            </div>
          </template>

          <!-- Dock shelf -->
          <template v-else-if="activeDialog === 'dockShelf'">
            <div class="modal-icon" style="background:#FAEEDA;">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#854F0B" stroke-width="1.5">
                <rect x="2" y="5" width="12" height="8" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><line x1="8" y1="7" x2="8" y2="9"/><line x1="6" y1="8" x2="10" y2="8"/>
              </svg>
            </div>
            <div class="modal-title">{{ t('robotStatus.modal.dock.title') }}</div>
            <div class="modal-desc">{{ t('robotStatus.modal.dock.desc') }}</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="activeDialog = null">{{ t('common.cancel') }}</button>
              <button class="btn-blue" :disabled="loading" @click="confirmAction('dockShelf')">
                {{ loading ? t('common.wait') : t('common.confirm') }}
              </button>
            </div>
          </template>

          <!-- Undock shelf -->
          <template v-else-if="activeDialog === 'undockShelf'">
            <div class="modal-icon" style="background:#FAEEDA;">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#854F0B" stroke-width="1.5">
                <rect x="2" y="5" width="12" height="8" rx="1"/><path d="M5 5V4a3 3 0 016 0v1"/><line x1="8" y1="9" x2="8" y2="11"/><line x1="6" y1="10" x2="10" y2="10"/>
              </svg>
            </div>
            <div class="modal-title">{{ t('robotStatus.modal.undock.title') }}</div>
            <div class="modal-desc">{{ t('robotStatus.modal.undock.desc') }}</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="activeDialog = null">{{ t('common.cancel') }}</button>
              <button class="btn-blue" :disabled="loading" @click="confirmAction('undockShelf')">
                {{ loading ? t('common.wait') : t('common.confirm') }}
              </button>
            </div>
          </template>

          <!-- Return to charger -->
          <template v-else-if="activeDialog === 'returnHome'">
            <div class="modal-icon" style="background:#EAF3DE;">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#3B6D11" stroke-width="1.5">
                <path d="M13 8A5 5 0 1 1 8 3"/><polyline points="13 3 13 8 8 8"/>
              </svg>
            </div>
            <div class="modal-title">{{ t('robotStatus.modal.home.title') }}</div>
            <div class="modal-desc">{{ t('robotStatus.modal.home.desc') }}</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="activeDialog = null">{{ t('common.cancel') }}</button>
              <button class="btn-blue" :disabled="loading" @click="confirmAction('returnHome')">
                {{ loading ? t('common.wait') : t('common.confirm') }}
              </button>
            </div>
          </template>

          <!-- Emergency stop -->
          <template v-else-if="activeDialog === 'estop'">
            <div class="modal-icon" style="background:#FCEBEB;">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#A32D2D" stroke-width="1.5">
                <circle cx="8" cy="8" r="6"/>
                <line x1="8" y1="5" x2="8" y2="9"/>
              </svg>
            </div>
            <div class="modal-title">{{ t('robotStatus.modal.estop.title') }}</div>
            <div class="modal-desc">{{ t('robotStatus.modal.estop.desc') }}</div>
            <div class="modal-actions">
              <button class="btn-secondary" @click="activeDialog = null">{{ t('common.cancel') }}</button>
              <button class="btn-red" :disabled="loading" @click="confirmAction('estop')">
                {{ loading ? t('common.wait') : t('robotStatus.modal.estop.confirm') }}
              </button>
            </div>
          </template>

        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import socket from '../socket'
import { pauseRobot, resumeRobot, emergencyStop, returnHome, dockShelf, undockShelf, getRobotStatus } from '../api/robot'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

const robotStatus  = ref(null)
const connected    = ref(socket.connected)
const activeDialog = ref(null)
const loading      = ref(false)
const errorMsg     = ref('')

function commandStateLabel(state) {
  if (state === 'COMMAND_STATE_RUNNING') return t('status.navigating')
  if (state === 'COMMAND_STATE_PENDING') return t('status.idle')
  return '—'
}

async function confirmAction(action) {
  loading.value  = true
  errorMsg.value = ''
  try {
    if (action === 'pause')       await pauseRobot()
    if (action === 'resume')      await resumeRobot()
    if (action === 'estop')       await emergencyStop()
    if (action === 'returnHome')  await returnHome()
    if (action === 'dockShelf')   await dockShelf()
    if (action === 'undockShelf') await undockShelf()
    activeDialog.value = null
  } catch (e) {
    errorMsg.value = e.response?.data?.error || e.message
    activeDialog.value = null
  } finally {
    loading.value = false
  }
}

function onKeydown(e) { if (e.key === 'Escape') activeDialog.value = null }

const onConnect    = () => { connected.value = true  }
const onDisconnect = () => { connected.value = false }
const onStatus     = (s) => { robotStatus.value = s  }

onMounted(async () => {
  try {
    const res = await getRobotStatus()
    robotStatus.value = res.data.data
  } catch (_) {}

  socket.on('connect',      onConnect)
  socket.on('disconnect',   onDisconnect)
  socket.on('robot:status', onStatus)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  socket.off('connect',      onConnect)
  socket.off('disconnect',   onDisconnect)
  socket.off('robot:status', onStatus)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.modal {
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
  width: 360px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.modal-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-title { font-size: 16px; font-weight: 600; text-align: center; }
.modal-desc  { font-size: 13px; color: #666; text-align: center; line-height: 1.5; }
.modal-actions { display: flex; gap: 8px; margin-top: 4px; width: 100%; }
.modal-actions button { flex: 1; }
</style>
