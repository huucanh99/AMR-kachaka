<template>
  <div class="map-page">

    <!-- Left: current map image -->
    <div class="map-image-panel">
      <div class="panel-header">
        <span class="panel-title">{{ t('map.currentMap') }}</span>
        <button class="btn-secondary" :disabled="loadingPng" @click="loadAll">
          {{ loadingPng ? t('common.loading') : t('map.refresh') }}
        </button>
      </div>

      <div class="map-canvas-wrap">
        <div v-if="loadingPng" class="map-placeholder">{{ t('map.loading') }}</div>
        <img v-else-if="pngData" :src="pngData.image" class="map-img" :alt="pngData.name" />
        <div v-else class="map-placeholder">{{ t('map.noImage') }}</div>
      </div>

      <div v-if="pngData" class="map-meta">
        <span>{{ pngData.name }}</span>
        <span>{{ t('map.size') }}: {{ pngData.width }} × {{ pngData.height }} px</span>
        <span>{{ t('map.resolution') }}: {{ pngData.resolution?.toFixed(4) }} m/px</span>
      </div>
    </div>

    <!-- Right: map list -->
    <div class="map-list-panel">
      <div class="panel-header">
        <span class="panel-title">{{ t('map.mapList') }}</span>
      </div>

      <div v-if="loadingList" class="list-loading">{{ t('common.loading') }}</div>
      <div v-else-if="!maps.length" class="list-empty">{{ t('map.noMaps') }}</div>

      <div
        v-for="m in maps"
        :key="m.id"
        class="map-row"
        :class="{ active: m.id === currentMapId, selected: m.id === selectedId }"
        @click="selectMap(m)"
      >
        <div class="map-row-info">
          <span class="map-row-name">{{ m.name || m.id }}</span>
          <span v-if="m.id === currentMapId" class="badge-active">{{ t('map.active') }}</span>
        </div>
        <span class="map-row-id">{{ m.id }}</span>
      </div>

      <!-- Preview & switch for selected map -->
      <div v-if="selectedId && selectedId !== currentMapId" class="map-actions">
        <div class="preview-wrap">
          <div v-if="loadingPreview" class="map-placeholder small">{{ t('map.previewLoading') }}</div>
          <img v-else-if="previewData" :src="previewData.image" class="preview-img" :alt="previewData.name" />
          <div v-else class="map-placeholder small">{{ t('map.noImage') }}</div>
        </div>

        <button class="btn-primary" :disabled="switching" @click="confirmSwitch">
          {{ switching ? t('map.switching') : t('map.switchTo') }}
        </button>
      </div>

      <div v-if="feedback" class="feedback" :class="feedback.type">{{ feedback.msg }}</div>
    </div>

    <!-- Confirm modal -->
    <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm = false">
      <div class="modal">
        <div class="modal-title">{{ t('map.confirmSwitch').replace('{name}', selectedName) }}</div>
        <div class="modal-desc">{{ t('map.confirmSwitchDesc') }}</div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showConfirm = false">{{ t('common.cancel') }}</button>
          <button class="btn-danger" :disabled="switching" @click="doSwitch">
            {{ switching ? t('map.switching') : t('map.confirmBtn') }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from '../composables/useI18n'
import { getMapList, getMapPng, getMapPreview, switchMap } from '../api/robot'

const { t } = useI18n()

const maps         = ref([])
const currentMapId = ref(null)
const selectedId   = ref(null)
const pngData      = ref(null)
const previewData  = ref(null)

const loadingList    = ref(false)
const loadingPng     = ref(false)
const loadingPreview = ref(false)
const switching      = ref(false)
const showConfirm    = ref(false)
const feedback       = ref(null)

const selectedName = computed(() => {
  const m = maps.value.find(x => x.id === selectedId.value)
  return m?.name || selectedId.value || ''
})

async function loadAll() {
  await Promise.all([loadList(), loadPng()])
}

async function loadList() {
  loadingList.value = true
  try {
    const res = await getMapList()
    maps.value      = res.data.data.maps || []
    currentMapId.value = res.data.data.currentMapId
  } catch {
    maps.value = []
  } finally {
    loadingList.value = false
  }
}

async function loadPng() {
  loadingPng.value = true
  try {
    const res = await getMapPng()
    pngData.value = res.data.data
  } catch {
    pngData.value = null
  } finally {
    loadingPng.value = false
  }
}

async function selectMap(m) {
  selectedId.value  = m.id
  previewData.value = null
  if (m.id === currentMapId.value) return
  loadingPreview.value = true
  try {
    const res = await getMapPreview(m.id)
    previewData.value = res.data.data
  } catch {
    previewData.value = null
  } finally {
    loadingPreview.value = false
  }
}

function confirmSwitch() {
  showConfirm.value = true
}

async function doSwitch() {
  if (!selectedId.value) return
  switching.value   = true
  showConfirm.value = false
  feedback.value    = null
  try {
    await switchMap(selectedId.value)
    feedback.value = { type: 'success', msg: t('map.switchSuccess') }
    currentMapId.value = selectedId.value
    await loadPng()
  } catch {
    feedback.value = { type: 'error', msg: t('map.switchFailed') }
  } finally {
    switching.value = false
  }
}

onMounted(loadAll)
</script>

<style scoped>
.map-page {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 20px;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  min-height: 0;
}

.map-image-panel,
.map-list-panel {
  background: #1a1d2e;
  border-radius: 10px;
  border: 1px solid #2a2d3e;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #2a2d3e;
  flex-shrink: 0;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #c8cfe8;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.map-canvas-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  min-height: 0;
  background: #12141f;
}

.map-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
  image-rendering: pixelated;
}

.map-placeholder {
  color: #555;
  font-size: 13px;
}
.map-placeholder.small {
  font-size: 12px;
  padding: 20px 0;
}

.map-meta {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid #2a2d3e;
  font-size: 11px;
  color: #6b7295;
  flex-shrink: 0;
}

.list-loading,
.list-empty {
  padding: 24px 16px;
  color: #555;
  font-size: 13px;
  text-align: center;
}

.map-row {
  padding: 10px 16px;
  border-bottom: 1px solid #1e2132;
  cursor: pointer;
  transition: background 0.15s;
}
.map-row:hover { background: #1e2132; }
.map-row.active { border-left: 3px solid #639922; }
.map-row.selected { background: #1e2132; }

.map-row-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.map-row-name {
  font-size: 13px;
  color: #c8cfe8;
  font-weight: 500;
}

.map-row-id {
  font-size: 10px;
  color: #555;
  font-family: monospace;
}

.badge-active {
  background: #1e3a10;
  color: #639922;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.map-actions {
  padding: 12px 16px;
  border-top: 1px solid #2a2d3e;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-wrap {
  background: #12141f;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  overflow: hidden;
}

.preview-img {
  max-width: 100%;
  max-height: 160px;
  object-fit: contain;
  image-rendering: pixelated;
}

.feedback {
  margin: 8px 16px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
}
.feedback.success { background: #1e3a10; color: #639922; }
.feedback.error   { background: #3a1010; color: #e24b4a; }

.btn-primary {
  background: #3d6bcc;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
  width: 100%;
}
.btn-primary:hover:not(:disabled) { background: #4d7bdc; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  background: #2a2d3e;
  color: #c8cfe8;
  border: 1px solid #3a3d55;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-secondary:hover:not(:disabled) { background: #3a3d55; }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger {
  background: #7a1f1f;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-danger:hover:not(:disabled) { background: #9a2f2f; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #1a1d2e;
  border: 1px solid #2a2d3e;
  border-radius: 10px;
  padding: 24px;
  max-width: 380px;
  width: 90%;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: #c8cfe8;
  margin-bottom: 10px;
}

.modal-desc {
  font-size: 13px;
  color: #6b7295;
  margin-bottom: 20px;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
