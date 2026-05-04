<template>
  <div class="content">
    <div class="card">
      <div class="card-title">{{ t('createTask.title') }}</div>

      <div v-if="loadingInit" style="color:#aaa;font-size:13px;padding:8px 0;">{{ t('createTask.loadingLocations') }}</div>

      <div v-else class="form-grid">
        <div class="form-group">
          <label class="form-label">{{ t('createTask.pickupLocation') }}</label>
          <select v-model="form.pickupLocationId">
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">{{ t('createTask.destination') }}</label>
          <select v-model="form.destinationId">
            <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">{{ t('createTask.shelfLayer') }}</label>
          <div v-if="hasShelfOn" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:11px;background:#EAF3DE;color:#3B6D11;border-radius:99px;padding:2px 8px;font-weight:500;">
              {{ t('createTask.hasShelf') }}
            </span>
          </div>
          <div v-else style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="font-size:11px;background:#f0f0ee;color:#888;border-radius:99px;padding:2px 8px;">
              {{ t('createTask.noShelfBadge') }}
            </span>
          </div>
          <select v-model="form.shelfLayer" :disabled="!hasShelfOn">
            <option v-if="!hasShelfOn" value="">{{ t('common.noShelf') }}</option>
            <option v-for="l in availLayers" :key="l.layer" :value="l.layer">{{ t('createTask.layerActive', { n: l.layer }) }}</option>
          </select>
          <div v-if="!hasShelfOn" class="form-hint" style="color:#A32D2D;">{{ t('createTask.noShelfHint') }}</div>
          <div v-else class="form-hint">{{ t('createTask.activeLayersOnly') }}</div>
        </div>
        <div class="form-group">
          <label class="form-label">{{ t('createTask.verificationCode') }}{{ form.shelfLayer ? '' : ' ' + t('createTask.optional') }}</label>
          <input type="text" v-model="form.verificationCode" :placeholder="form.shelfLayer ? t('createTask.codeMin4') : t('createTask.codeNotRequired')" />
          <div v-if="form.shelfLayer" class="form-hint">{{ t('createTask.codeHint') }}</div>
        </div>
        <div class="form-group">
          <label class="form-label">{{ t('createTask.receiver') }}</label>
          <input type="text" v-model="form.receiverName" :placeholder="t('createTask.receiverPlaceholder')" />
        </div>
      </div>

      <div v-if="errorMsg" style="color:#A32D2D;font-size:13px;margin-top:8px;">{{ errorMsg }}</div>

      <hr class="divider" />
      <div style="display:flex;justify-content:space-between;">
        <button class="btn-secondary" @click="resetForm">{{ t('createTask.reset') }}</button>
        <button class="btn-primary" :disabled="loading || loadingInit" @click="submitTask">
          {{ loading ? t('createTask.submitting') : t('createTask.submit') }}
        </button>
      </div>
    </div>

    <!-- Toast notification -->
    <div v-if="showToast" class="toast">
      <div style="width:16px;height:16px;border-radius:50%;background:#EAF3DE;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#3B6D11" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="2,6 5,9 10,3"/>
        </svg>
      </div>
      <div>
        <div style="font-size:13px;font-weight:500;">{{ t('createTask.successTitle', { id: lastTaskId }) }}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">{{ t('createTask.successMsg') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getLocations, getShelfLayers, getMovingShelf } from '../api/robot'
import { createTask } from '../api/tasks'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

const SHELF_ID = 'shelf-001'

const locations    = ref([])
const availLayers  = ref([])
const hasShelfOn   = ref(false)
const loadingInit  = ref(true)
const loading      = ref(false)
const errorMsg     = ref('')
const showToast    = ref(false)
const lastTaskId   = ref(null)

const defaultForm = () => ({
  pickupLocationId:  '',
  destinationId:     '',
  shelfLayer:        '',
  verificationCode:  '',
  receiverName:      '',
})

const form = ref(defaultForm())

async function loadSelects() {
  const [locRes, shelfRes, layerRes] = await Promise.all([
    getLocations(),
    getMovingShelf(),
    getShelfLayers(SHELF_ID),
  ])

  locations.value  = locRes.data.data
  hasShelfOn.value = !!shelfRes.data.data.shelfId
  availLayers.value = layerRes.data.data.filter(l => l.status === 'active')

  if (locations.value.length) {
    form.value.pickupLocationId = locations.value[0].id
    form.value.destinationId    = locations.value[1]?.id || locations.value[0].id
  }

  if (hasShelfOn.value && availLayers.value.length) {
    form.value.shelfLayer = availLayers.value[0].layer
  } else {
    form.value.shelfLayer = ''
  }
}

onMounted(async () => {
  try { await loadSelects() } catch (e) { errorMsg.value = 'Failed to load data: ' + e.message }
  loadingInit.value = false
})

function resetForm() {
  form.value      = defaultForm()
  showToast.value = false
  errorMsg.value  = ''
  if (locations.value.length) {
    form.value.pickupLocationId = locations.value[0].id
    form.value.destinationId    = locations.value[1]?.id || locations.value[0].id
  }
  if (hasShelfOn.value && availLayers.value.length) form.value.shelfLayer = availLayers.value[0].layer
}

async function submitTask() {
  loading.value   = true
  errorMsg.value  = ''
  showToast.value = false
  try {
    const useShelf = hasShelfOn.value && !!form.value.shelfLayer
    const res = await createTask({
      pickupLocationId: form.value.pickupLocationId,
      destinationId:    form.value.destinationId,
      shelfId:          useShelf ? SHELF_ID : null,
      shelfLayer:       useShelf ? Number(form.value.shelfLayer) : null,
      verificationCode: useShelf ? form.value.verificationCode : null,
      receiverName:     form.value.receiverName,
    })
    lastTaskId.value = res.data.data.id
    showToast.value  = true

    const layerRes = await getShelfLayers(SHELF_ID)
    availLayers.value = layerRes.data.data.filter(l => l.status === 'active')
    form.value.shelfLayer = availLayers.value.length ? availLayers.value[0].layer : ''
  } catch (e) {
    errorMsg.value = e.response?.data?.error || e.message
  } finally {
    loading.value = false
  }
}
</script>
