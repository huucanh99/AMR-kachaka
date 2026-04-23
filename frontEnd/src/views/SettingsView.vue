<template>
  <div class="content">
    <!-- Robot settings -->
    <div class="card">
      <div class="card-title">Robot settings</div>
      <div class="setting-row">
        <div><div class="setting-label">Robot name</div></div>
        <input type="text" v-model="robotSettings.name" style="width:150px;" />
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Max speed</div></div>
        <input type="text" v-model="robotSettings.maxSpeed" style="width:150px;" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Battery warning</div>
          <div class="setting-hint">Alert when below this level</div>
        </div>
        <input type="text" v-model="robotSettings.batteryWarning" style="width:150px;" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Auto return to standby</div>
          <div class="setting-hint">When no tasks in queue</div>
        </div>
        <div class="toggle" :class="{ off: !robotSettings.autoReturn }" @click="robotSettings.autoReturn = !robotSettings.autoReturn">
          <div class="toggle-knob"></div>
        </div>
      </div>
      <button class="btn-primary" style="margin-top:1rem;" @click="saveRobot">Save</button>
    </div>

    <!-- System settings -->
    <div class="card">
      <div class="card-title">System settings</div>

      <div v-if="loadingSettings" style="color:#aaa;font-size:13px;padding:8px 0;">Loading…</div>

      <template v-else>
        <div class="setting-row">
          <div>
            <div class="setting-label">Pickup timeout</div>
            <div class="setting-hint">Seconds before cancelling if sender doesn't verify</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input
              type="number" min="1" v-model.number="systemSettings.pickupTimeoutSeconds"
              style="width:90px;"
            />
            <span style="font-size:13px;color:#888;">sec</span>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">Delivery timeout</div>
            <div class="setting-hint">Seconds before alerting admin if receiver doesn't verify</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input
              type="number" min="1" v-model.number="systemSettings.deliveryTimeoutSeconds"
              style="width:90px;"
            />
            <span style="font-size:13px;color:#888;">sec</span>
          </div>
        </div>

        <div class="setting-row">
          <div><div class="setting-label">Language</div></div>
          <select v-model="systemSettings.language" style="width:150px;">
            <option>English</option>
            <option>繁體中文</option>
          </select>
        </div>

        <div v-if="saveError" style="color:#A32D2D;font-size:13px;margin-top:6px;">{{ saveError }}</div>
        <div v-if="saveOk"    style="color:#3B6D11;font-size:13px;margin-top:6px;">Settings saved.</div>

        <button class="btn-primary" style="margin-top:1rem;" :disabled="saving" @click="saveSystem">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getSettings, updateSettings } from '../api/settings'

const robotSettings = ref({
  name: 'AMR-01',
  maxSpeed: '1.2 m/s',
  batteryWarning: '20%',
  autoReturn: true,
})

const systemSettings = ref({
  pickupTimeoutSeconds:   60,
  deliveryTimeoutSeconds: 60,
  language: 'English',
})

const loadingSettings = ref(true)
const saving          = ref(false)
const saveError       = ref('')
const saveOk          = ref(false)

onMounted(async () => {
  try {
    const res = await getSettings()
    systemSettings.value.pickupTimeoutSeconds   = res.data.data.pickupTimeoutSeconds
    systemSettings.value.deliveryTimeoutSeconds = res.data.data.deliveryTimeoutSeconds
  } catch (e) {
    console.warn('Could not load settings:', e.message)
  } finally {
    loadingSettings.value = false
  }
})

function saveRobot() {
  alert('Robot settings saved!')
}

async function saveSystem() {
  saving.value    = true
  saveError.value = ''
  saveOk.value    = false
  try {
    await updateSettings({
      pickupTimeoutSeconds:   systemSettings.value.pickupTimeoutSeconds,
      deliveryTimeoutSeconds: systemSettings.value.deliveryTimeoutSeconds,
    })
    saveOk.value = true
    setTimeout(() => { saveOk.value = false }, 3000)
  } catch (e) {
    saveError.value = e.response?.data?.error || e.message
  } finally {
    saving.value = false
  }
}
</script>
