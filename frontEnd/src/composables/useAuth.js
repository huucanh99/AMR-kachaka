import { ref, computed } from 'vue'
import api from '../api/client'

const token = ref(localStorage.getItem('token') || null)
const user  = ref(JSON.parse(localStorage.getItem('user') || 'null'))

// Keep axios Authorization header in sync
if (token.value) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`
}

export function useAuth() {
  const isLoggedIn = computed(() => !!token.value)

  function setAuth(data) {
    token.value = data.token
    user.value  = data.user
    localStorage.setItem('token', data.token)
    localStorage.setItem('user',  JSON.stringify(data.user))
    api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`
  }

  function clearAuth() {
    token.value = null
    user.value  = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    delete api.defaults.headers.common['Authorization']
  }

  return { token, user, isLoggedIn, setAuth, clearAuth }
}
