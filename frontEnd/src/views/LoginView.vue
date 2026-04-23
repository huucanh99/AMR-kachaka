<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="auth-logo">
        <span class="auth-logo-icon">🤖</span>
        <span class="auth-logo-text">Kachaka AMR</span>
      </div>
      <h2 class="auth-title">Sign in</h2>

      <form @submit.prevent="submit">
        <div class="form-group">
          <label>Email</label>
          <input v-model="form.email" type="email" placeholder="you@example.com" required autocomplete="email" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input v-model="form.password" type="password" placeholder="••••••••" required autocomplete="current-password" />
        </div>

        <div v-if="error" class="auth-error">{{ error }}</div>

        <button type="submit" class="btn-primary auth-submit" :disabled="loading">
          {{ loading ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>

    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { login } from '../api/auth'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { setAuth } = useAuth()

const form    = ref({ email: '', password: '' })
const loading = ref(false)
const error   = ref(null)

async function submit() {
  loading.value = true
  error.value   = null
  try {
    const res = await login(form.value)
    setAuth(res.data.data)
    router.push('/')
  } catch (err) {
    error.value = err.response?.data?.error || 'Login failed'
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
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  font-size: 0.82rem;
  color: #aaa;
  margin-bottom: 5px;
}
.form-group input {
  width: 100%;
  padding: 9px 12px;
  background: #0f1117;
  border: 1px solid #2a2d3e;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.9rem;
  box-sizing: border-box;
}
.form-group input:focus {
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
