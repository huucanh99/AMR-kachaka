<template>
  <div class="content">
    <!-- Robot settings -->
    <div class="card">
      <div class="card-title">{{ t('settings.robotSettings') }}</div>
      <div class="setting-row">
        <div><div class="setting-label">{{ t('settings.robotName') }}</div></div>
        <input type="text" v-model="robotSettings.name" style="width:150px;" />
      </div>
      <div class="setting-row">
        <div><div class="setting-label">{{ t('settings.maxSpeed') }}</div></div>
        <input type="text" v-model="robotSettings.maxSpeed" style="width:150px;" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.batteryWarning') }}</div>
          <div class="setting-hint">{{ t('settings.batteryWarningHint') }}</div>
        </div>
        <input type="text" v-model="robotSettings.batteryWarning" style="width:150px;" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">{{ t('settings.autoReturn') }}</div>
          <div class="setting-hint">{{ t('settings.autoReturnHint') }}</div>
        </div>
        <div class="toggle" :class="{ off: !robotSettings.autoReturn }" @click="robotSettings.autoReturn = !robotSettings.autoReturn">
          <div class="toggle-knob"></div>
        </div>
      </div>
      <button class="btn-primary" style="margin-top:1rem;" @click="saveRobot">{{ t('common.save') }}</button>
    </div>

    <!-- System settings -->
    <div class="card">
      <div class="card-title">{{ t('settings.systemSettings') }}</div>

      <div v-if="loadingSettings" style="color:#aaa;font-size:13px;padding:8px 0;">{{ t('common.loading') }}</div>

      <template v-else>
        <div class="setting-row">
          <div>
            <div class="setting-label">{{ t('settings.pickupTimeout') }}</div>
            <div class="setting-hint">{{ t('settings.pickupTimeoutHint') }}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="number" min="1" v-model.number="systemSettings.pickupTimeoutSeconds" style="width:90px;" />
            <span style="font-size:13px;color:#888;">{{ t('settings.sec') }}</span>
          </div>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">{{ t('settings.deliveryTimeout') }}</div>
            <div class="setting-hint">{{ t('settings.deliveryTimeoutHint') }}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="number" min="1" v-model.number="systemSettings.deliveryTimeoutSeconds" style="width:90px;" />
            <span style="font-size:13px;color:#888;">{{ t('settings.sec') }}</span>
          </div>
        </div>

        <div class="setting-row">
          <div><div class="setting-label">{{ t('settings.language') }}</div></div>
          <select v-model="systemSettings.language" style="width:150px;">
            <option value="en">English</option>
            <option value="zh-TW">繁體中文</option>
          </select>
        </div>

        <div v-if="saveError" style="color:#A32D2D;font-size:13px;margin-top:6px;">{{ saveError }}</div>
        <div v-if="saveOk"    style="color:#3B6D11;font-size:13px;margin-top:6px;">{{ t('settings.saved') }}</div>

        <button class="btn-primary" style="margin-top:1rem;" :disabled="saving" @click="saveSystem">
          {{ saving ? t('common.saving') : t('common.save') }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getSettings, updateSettings } from '../api/settings'
import { useI18n } from '../composables/useI18n'

const { t, lang, setLang } = useI18n()

const robotSettings = ref({
  name: 'AMR-01',
  maxSpeed: '1.2 m/s',
  batteryWarning: '20%',
  autoReturn: true,
})

const systemSettings = ref({
  pickupTimeoutSeconds:   60,
  deliveryTimeoutSeconds: 60,
  language: lang.value,  // khởi tạo từ localStorage, không phải 'en' cứng
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
    // không gọi setLang ở đây — localStorage là source of truth
    // chỉ sync dropdown nếu backend có giá trị khác localStorage (vd đổi máy)
    if (res.data.data.language && res.data.data.language !== lang.value) {
      systemSettings.value.language = res.data.data.language
      // watch sẽ tự gọi setLang
    }
  } catch (e) {
    console.warn('Could not load settings:', e.message)
  } finally {
    loadingSettings.value = false
  }
})

function saveRobot() {
  alert(t('settings.robotSettings') + ' saved!')
}

async function saveSystem() {
  saving.value    = true
  saveError.value = ''
  saveOk.value    = false
  try {
    await updateSettings({
      pickupTimeoutSeconds:   systemSettings.value.pickupTimeoutSeconds,
      deliveryTimeoutSeconds: systemSettings.value.deliveryTimeoutSeconds,
      language:               systemSettings.value.language,
    })
    setLang(systemSettings.value.language)
    saveOk.value = true
    setTimeout(() => { saveOk.value = false }, 3000)
  } catch (e) {
    saveError.value = e.response?.data?.error || e.message
  } finally {
    saving.value = false
  }
}
</script>
