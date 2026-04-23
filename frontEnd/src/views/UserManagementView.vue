<template>
  <div class="content">
    <div class="card" style="max-width:520px;margin-bottom:1.5rem;">
      <div class="card-title">Create user</div>
      <form @submit.prevent="submitCreate" style="display:flex;flex-direction:column;gap:0.75rem;">
        <div class="form-group">
          <label>Username</label>
          <input v-model="form.username" type="text" placeholder="johndoe" required />
        </div>
        <div class="form-group">
          <label>Email</label>
          <input v-model="form.email" type="email" placeholder="you@example.com" required />
        </div>
        <div class="form-group">
          <label>Password <span class="hint">(min 6 characters)</span></label>
          <input v-model="form.password" type="password" placeholder="••••••••" required />
        </div>

        <div v-if="createError" class="alert-error">{{ createError }}</div>
        <div v-if="createSuccess" class="alert-success">User created successfully.</div>

        <button type="submit" class="btn-primary" :disabled="creating" style="align-self:flex-start;padding:8px 20px;">
          {{ creating ? 'Creating...' : 'Create user' }}
        </button>
      </form>
    </div>

    <div class="card">
      <div class="card-title">Users</div>
      <div v-if="loadingUsers" style="color:#888;padding:0.5rem 0;">Loading...</div>
      <div v-else-if="fetchError" style="color:#e57373;">{{ fetchError }}</div>
      <table v-else>
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Created</th>
            <th style="width:60px;"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.username }}</td>
            <td style="color:#888;font-size:0.85rem;">{{ u.email }}</td>
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
            <td colspan="4" style="text-align:center;color:#888;padding:1rem;">No users found</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { register, getUsers, deleteUser } from '../api/auth'
import { useAuth } from '../composables/useAuth'

const { user: currentUser } = useAuth()

const users       = ref([])
const loadingUsers = ref(true)
const fetchError  = ref(null)

const form          = ref({ username: '', email: '', password: '' })
const creating      = ref(false)
const createError   = ref(null)
const createSuccess = ref(false)

async function fetchUsers() {
  try {
    fetchError.value = null
    const res = await getUsers()
    users.value = res.data.data
  } catch (err) {
    fetchError.value = 'Failed to load users'
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
    form.value = { username: '', email: '', password: '' }
    fetchUsers()
    setTimeout(() => { createSuccess.value = false }, 3000)
  } catch (err) {
    createError.value = err.response?.data?.error || 'Failed to create user'
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
.form-row {
  display: flex;
  gap: 0.75rem;
}
.form-row .form-group { flex: 1; }
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
  background: #0f1117;
  border: 1px solid #2a2d3e;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.88rem;
}
.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4f8ef7;
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
.role-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.role-badge.admin    { background: rgba(79,142,247,0.15); color: #4f8ef7; }
.role-badge.operator { background: rgba(102,187,106,0.15); color: #66bb6a; }
.role-badge.viewer   { background: rgba(170,170,170,0.1); color: #aaa; }
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
