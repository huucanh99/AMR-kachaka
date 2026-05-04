<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <span class="auth-logo-icon">🤖</span>
        <span class="auth-logo-text">Kachaka AMR</span>
      </div>
      <h2 class="auth-title">{{ t('register.title') }}</h2>

      <form @submit.prevent="submit">
        <div class="form-group">
          <label>{{ t('register.username') }}</label>
          <input v-model="form.username" type="text" placeholder="johndoe" required autocomplete="username" />
        </div>
        <div class="form-group">
          <label>{{ t('register.password') }} <span class="hint">{{ t('register.passwordHint') }}</span></label>
          <input v-model="form.password" type="password" placeholder="••••••••" required autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label>{{ t('register.role') }}</label>
          <select v-model="form.role">
            <option value="operator">{{ t('users.roleOperator') }}</option>
            <option value="viewer">{{ t('users.roleViewer') }}</option>
            <option value="admin">{{ t('users.roleAdmin') }}</option>
          </select>
        </div>

        <div v-if="error" class="auth-error">{{ error }}</div>
        <div v-if="success" class="auth-success">{{ t('register.success') }}</div>

        <button type="submit" class="btn-primary auth-submit" :disabled="loading">
          {{ loading ? t('register.submitting') : t('register.submit') }}
        </button>
      </form>

      <p class="auth-switch">
        {{ t('register.haveAccount') }}
        <router-link to="/login">{{ t('register.signIn') }}</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { register } from '../api/auth'
import { useI18n } from '../composables/useI18n'

const router  = useRouter()
const { t }   = useI18n()

const form    = ref({ username: '', password: '', role: 'operator' })
const loading = ref(false)
const error   = ref(null)
const success = ref(false)

async function submit() {
  loading.value = true
  error.value   = null
  try {
    await register(form.value)
    success.value = true
    setTimeout(() => router.push('/login'), 1500)
  } catch (err) {
    error.value = err.response?.data?.error || t('register.failed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f1117;
}
.auth-card {
  background: #1a1d27;
  border: 1px solid #2a2d3e;
  border-radius: 12px;
  padding: 2.5rem 2rem;
  width: 100%;
  max-width: 380px;
}
.auth-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 1.5rem;
}
.auth-logo-icon { font-size: 1.6rem; }
.auth-logo-text { font-size: 1.1rem; font-weight: 600; color: #e0e0e0; }
.auth-title {
  font-size: 1.4rem;
  font-weight: 600;
  color: #fff;
  margin: 0 0 1.5rem;
}
.form-group { margin-bottom: 1rem; }
.form-group label {
  display: block;
  font-size: 0.82rem;
  color: #aaa;
  margin-bottom: 5px;
}
.hint { color: #666; font-size: 0.78rem; }
.form-group input,
.form-group select {
  width: 100%;
  padding: 9px 12px;
  background: #252836;
  border: 1px solid #3d4166;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4f8ef7;
}
.auth-error {
  background: rgba(229,115,115,0.12);
  border: 1px solid rgba(229,115,115,0.3);
  color: #e57373;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.auth-success {
  background: rgba(102,187,106,0.12);
  border: 1px solid rgba(102,187,106,0.3);
  color: #66bb6a;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.auth-submit {
  width: 100%;
  padding: 10px;
  margin-top: 0.5rem;
  font-size: 0.95rem;
}
.auth-switch {
  margin-top: 1.2rem;
  text-align: center;
  font-size: 0.85rem;
  color: #888;
}
.auth-switch a {
  color: #4f8ef7;
  text-decoration: none;
}
.auth-switch a:hover { text-decoration: underline; }
</style>
