<template>
  <div class="content">
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div class="card-title" style="margin-bottom:0;">{{ t('camera.title') }}</div>
        <div class="cam-tabs">
          <button
            v-for="tab in tabs" :key="tab.key"
            class="cam-tab" :class="{ active: selected === tab.key }"
            @click="selectCamera(tab.key)"
          >{{ t(tab.label) }}</button>
        </div>
      </div>

      <div class="stream-wrap">
        <img
          v-if="!error"
          :src="streamUrl"
          class="stream-img"
          :class="{ loading: !loaded }"
          @load="onLoad"
          @error="onError"
          alt="camera"
        />
        <div v-if="!loaded && !error" class="stream-overlay">
          <div class="spinner"></div>
          <span>{{ t('camera.connecting') }}</span>
        </div>
        <div v-if="error" class="stream-overlay error">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <span>{{ t('camera.error') }}</span>
          <button class="btn-retry" @click="retry">{{ t('camera.retry') }}</button>
        </div>
      </div>

      <div class="stream-info">
        <span class="live-dot"></span> LIVE &nbsp;·&nbsp; {{ t(tabs.find(t => t.key === selected)?.label) }} &nbsp;·&nbsp; ~10 fps
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

const tabs = [
  { key: 'front', label: 'camera.front' },
  { key: 'back',  label: 'camera.back'  },
  { key: 'tof',   label: 'camera.tof'   },
]

const selected = ref('front')
const loaded   = ref(false)
const error    = ref(false)
let   _ts      = ref(Date.now())

const streamUrl = computed(() =>
  `/api/robot/camera/${selected.value}?t=${_ts.value}`
)

function selectCamera(key) {
  selected.value = key
  loaded.value   = false
  error.value    = false
  _ts.value      = Date.now()
}

function onLoad()  { loaded.value = true;  error.value = false }
function onError() { loaded.value = false; error.value = true  }
function retry()   { error.value = false; loaded.value = false; _ts.value = Date.now() }
</script>

<style scoped>
.cam-tabs {
  display: flex;
  gap: 6px;
}
.cam-tab {
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid #2a2d3e;
  background: none;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.cam-tab:hover   { background: #1e2132; color: #ccc; }
.cam-tab.active  { background: #185FA5; color: #fff; border-color: #185FA5; }

.stream-wrap {
  position: relative;
  background: #0d0e14;
  border-radius: 8px;
  overflow: hidden;
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stream-img {
  width: 100%;
  display: block;
  border-radius: 8px;
  transition: opacity 0.3s;
}
.stream-img.loading { opacity: 0; }

.stream-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #aaa;
  font-size: 13px;
}
.stream-overlay.error { color: #e57373; }

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #2a2d3e;
  border-top-color: #185FA5;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-retry {
  margin-top: 4px;
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid #e57373;
  background: none;
  color: #e57373;
  font-size: 12px;
  cursor: pointer;
}
.btn-retry:hover { background: #e5737322; }

.stream-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #666;
  margin-top: 10px;
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e53935;
  animation: blink 1.2s ease-in-out infinite;
  display: inline-block;
}
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
</style>
