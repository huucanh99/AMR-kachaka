<template>
  <div class="content">
    <div class="card">
      <div class="card-header">
        <div class="card-title" style="margin-bottom:0;">Shelf layers — {{ SHELF_ID }}</div>
        <button class="btn-secondary" @click="openAdd">+ Add layer</button>
      </div>

      <div v-if="loading" style="color:#aaa;font-size:13px;padding:8px 0;">Loading…</div>

      <div v-else-if="layers.length === 0" style="color:#aaa;font-size:13px;padding:8px 0;">
        No shelf layers yet. Click "Add layer" to create one.
      </div>

      <template v-else>
        <div class="shelf-header-flex">
          <div class="col-s"><span style="font-size:11px;color:#aaa;">Layer</span></div>
          <div class="col-st"><span style="font-size:11px;color:#aaa;">Status</span></div>
          <div class="col-w"><span style="font-size:11px;color:#aaa;">Max weight</span></div>
          <div class="col-av"><span style="font-size:11px;color:#aaa;">In Create Task</span></div>
          <div class="col-ac"></div>
        </div>

        <div v-for="layer in layers" :key="layer.layer" class="shelf-row-flex">
          <div class="col-s">Layer {{ layer.layer }}</div>
          <div class="col-st">
            <span class="badge" :class="statusBadgeClass(layer.status)">
              <span class="dot" :style="{ background: statusDotColor(layer.status) }"></span>
              {{ statusLabel(layer.status) }}
            </span>
          </div>
          <div class="col-w">{{ layer.max_weight ?? 5 }} kg</div>
          <div class="col-av">
            <span class="check" :class="layer.status === 'active' ? 'yes' : 'no'">
              {{ layer.status === 'active' ? '✓' : '✗' }}
            </span>
          </div>
          <div class="col-ac">
            <template v-if="layer.status === 'busy'">
              <span style="font-size:11px;color:#aaa;padding:4px 10px;">
                In use by #{{ layer.task_id }}
                <span v-if="layer.receiver_name"> ({{ layer.receiver_name }})</span>
              </span>
            </template>
            <template v-else>
              <button class="btn-edit" @click="openEdit(layer)">Edit</button>
              <button
                v-if="layer.status === 'active'"
                class="btn-maint"
                :disabled="actionLoading === layer.layer"
                @click="setStatus(layer, 'maintenance')"
              >Set maintenance</button>
              <button
                v-else-if="layer.status === 'maintenance'"
                class="btn-activate"
                :disabled="actionLoading === layer.layer"
                @click="setStatus(layer, 'active')"
              >Set active</button>
            </template>
          </div>
        </div>
      </template>
    </div>

    <!-- Add layer modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal">
          <div class="modal-title">Add new layer</div>

          <div v-if="addError" style="color:#A32D2D;font-size:12px;width:100%;text-align:center;">{{ addError }}</div>

          <div class="modal-form">
            <div class="form-row">
              <label>Layer number</label>
              <input v-model.number="addForm.layer" type="number" min="1" placeholder="e.g. 1" />
            </div>
            <div class="form-row">
              <label>Max weight (kg)</label>
              <input v-model.number="addForm.maxWeight" type="number" min="0.5" step="0.5" placeholder="e.g. 5" />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-secondary" @click="showAddModal = false">Cancel</button>
            <button class="btn-blue" :disabled="addLoading" @click="submitAdd">
              {{ addLoading ? 'Creating…' : 'Create layer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Edit modal -->
    <Teleport to="body">
      <div v-if="editLayer" class="modal-overlay" @click.self="editLayer = null">
        <div class="modal">
          <div class="modal-title">Edit Layer {{ editLayer.layer }}</div>

          <div v-if="editError" style="color:#A32D2D;font-size:12px;width:100%;text-align:center;">{{ editError }}</div>

          <div class="modal-form">
            <div class="form-row">
              <label>Max weight (kg)</label>
              <input v-model.number="editWeight" type="number" min="0.5" step="0.5" />
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-secondary" @click="editLayer = null">Cancel</button>
            <button class="btn-blue" :disabled="editLoading" @click="submitEdit">
              {{ editLoading ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getShelfLayers, createShelfLayer, updateShelfLayer, setShelfLayerStatus } from '../api/robot'

const SHELF_ID      = 'shelf-001'
const layers        = ref([])
const loading       = ref(false)
const actionLoading = ref(null)

// Add modal
const showAddModal = ref(false)
const addLoading   = ref(false)
const addError     = ref('')
const addForm      = ref({ layer: '', maxWeight: 5 })

// Edit modal
const editLayer    = ref(null)
const editWeight   = ref(5)
const editLoading  = ref(false)
const editError    = ref('')

function statusLabel(s) {
  if (s === 'busy')        return 'Busy'
  if (s === 'maintenance') return 'Maintenance'
  return 'Active'
}
function statusBadgeClass(s) {
  if (s === 'busy')        return 'running'
  if (s === 'maintenance') return 'maintenance'
  return 'done'
}
function statusDotColor(s) {
  if (s === 'busy')        return '#A32D2D'
  if (s === 'maintenance') return '#EF9F27'
  return '#639922'
}

async function refresh() {
  loading.value = true
  try {
    const r = await getShelfLayers(SHELF_ID)
    layers.value = r.data.data
  } finally {
    loading.value = false
  }
}

function openAdd() {
  const nextLayer = layers.value.length
    ? Math.max(...layers.value.map(l => l.layer)) + 1
    : 1
  addForm.value = { layer: nextLayer, maxWeight: 5 }
  addError.value = ''
  showAddModal.value = true
}

async function submitAdd() {
  addError.value = ''
  if (!addForm.value.layer || addForm.value.layer < 1) {
    addError.value = 'Layer number must be ≥ 1'
    return
  }
  addLoading.value = true
  try {
    await createShelfLayer({
      shelfId:   SHELF_ID,
      layer:     addForm.value.layer,
      maxWeight: addForm.value.maxWeight || 5,
    })
    showAddModal.value = false
    await refresh()
  } catch (e) {
    addError.value = e.response?.data?.error || e.message
  } finally {
    addLoading.value = false
  }
}

function openEdit(layer) {
  editLayer.value  = layer
  editWeight.value = layer.max_weight ?? 5
  editError.value  = ''
}

async function submitEdit() {
  editError.value = ''
  editLoading.value = true
  try {
    await updateShelfLayer(SHELF_ID, editLayer.value.layer, { maxWeight: editWeight.value })
    editLayer.value = null
    await refresh()
  } catch (e) {
    editError.value = e.response?.data?.error || e.message
  } finally {
    editLoading.value = false
  }
}

async function setStatus(layer, status) {
  actionLoading.value = layer.layer
  try {
    await setShelfLayerStatus(SHELF_ID, layer.layer, status)
    await refresh()
  } finally {
    actionLoading.value = null
  }
}

onMounted(refresh)
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
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
  width: 340px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
}
.modal-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-row label {
  font-size: 12px;
  color: #aaa;
}
.form-row input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #e5e5e2;
  border-radius: 8px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
}
.form-row input:focus {
  border-color: #185FA5;
}
.modal-actions {
  display: flex;
  gap: 8px;
  width: 100%;
}
.modal-actions button { flex: 1; }
.btn-blue {
  background: #185FA5;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.btn-blue:hover:not(:disabled) { background: #1a6fbf; }
.btn-blue:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
