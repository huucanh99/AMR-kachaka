<template>
  <div class="content">
    <div class="card" style="max-width:520px;margin-bottom:1.5rem;">
      <div class="card-title">{{ t('users.createTitle') }}</div>
      <form @submit.prevent="submitCreate" style="display:flex;flex-direction:column;gap:0.75rem;">
        <div class="form-group">
          <label>{{ t('users.username') }}</label>
          <input v-model="form.username" type="text" placeholder="johndoe" required />
        </div>
        <div class="form-group">
          <label>{{ t('users.password') }} <span class="hint">{{ t('users.passwordHint') }}</span></label>
          <input v-model="form.password" type="password" placeholder="••••••••" required />
        </div>

        <div v-if="createError" class="alert-error">{{ createError }}</div>
        <div v-if="createSuccess" class="alert-success">{{ t('users.created') }}</div>

        <button type="submit" class="btn-primary" :disabled="creating" style="align-self:flex-start;padding:8px 20px;">
          {{ creating ? t('users.creating') : t('users.createBtn') }}
        </button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">{{ t('users.listTitle') }}</div>
      <div v-if="loadingUsers" style="color:#888;padding:0.5rem 0;">{{ t('users.loading') }}</div>
      <div v-else-if="fetchError" style="color:#e57373;">{{ fetchError }}</div>
      <table v-else>
        <thead>
          <tr>
            <th>{{ t('users.username') }}</th>
            <th>{{ t('users.createdAt') }}</th>
            <th style="width:60px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.username }}</td>
            <td style="color:#888;font-size:0.8rem;">{{ formatDate(u.created_at) }}</td>
            <td>
              <button
                v-if="u.role !== 'admin'"
                class="btn-delete"
                @click="removeUser(u)"
                title="Delete user"
              >✕</button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="3" style="text-align:center;color:#888;padding:1rem;">{{ t('users.noUsers') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { register, getUsers, deleteUser } from '../api/auth'
import { useI18n } from '../composables/useI18n'

const { t } = useI18n()

const users        = ref([])
const loadingUsers = ref(true)
const fetchError   = ref(null)

const form          = ref({ username: '', password: '' })
const creating      = ref(false)
const createError   = ref(null)
const createSuccess = ref(false)

async function fetchUsers() {
  try {
    fetchError.value = null
    const res = await getUsers()
    users.value = res.data.data
  } catch (err) {
    fetchError.value = t('users.loadFailed')
  } finally {
    loadingUsers.value = false
  }
}

async function submitCreate() {
  creating.value      = true
  createError.value   = null
  createSuccess.value = false
  try {
    await register(form.value)
    createSuccess.value = true
    form.value = { username: '', password: '' }
    fetchUsers()
    setTimeout(() => { createSuccess.value = false }, 3000)
  } catch (err) {
    createError.value = err.response?.data?.error || t('users.createFailed')
  } finally {
    creating.value = false
  }
}

async function removeUser(u) {
  if (!confirm(`Delete user "${u.username}"?`)) return
  try {
    await deleteUser(u.id)
    users.value = users.value.filter(x => x.id !== u.id)
  } catch (err) {
    alert(err.response?.data?.error || 'Failed to delete user')
  }
}

function formatDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('vi-VN')
}

onMounted(fetchUsers)
</script>

<style scoped>
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 0.82rem;
  color: #aaa;
}
.hint { color: #666; font-size: 0.75rem; }
.form-group input,
.form-group select {
  padding: 8px 10px;
  font-size: 0.88rem;
}
.alert-error {
  background: rgba(229,115,115,0.12);
  border: 1px solid rgba(229,115,115,0.3);
  color: #e57373;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.85rem;
}
.alert-success {
  background: rgba(102,187,106,0.12);
  border: 1px solid rgba(102,187,106,0.3);
  color: #66bb6a;
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.85rem;
}
.btn-delete {
  background: none;
  border: 1px solid #2a2d3e;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 3px 7px;
  transition: color 0.2s, border-color 0.2s;
}
.btn-delete:hover {
  color: #e57373;
  border-color: #e57373;
}
</style>
