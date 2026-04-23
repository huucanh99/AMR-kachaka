<template>
  <div class="sidebar">
    <div class="sidebar-logo">
      AMR Platform
      <span>Robot: AMR-01</span>
    </div>

    <RouterLink class="nav-item" to="/">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1"/>
        <rect x="9" y="1" width="6" height="6" rx="1"/>
        <rect x="1" y="9" width="6" height="6" rx="1"/>
        <rect x="9" y="9" width="6" height="6" rx="1"/>
      </svg>
      Dashboard
    </RouterLink>

    <RouterLink v-if="isAdmin" class="nav-item" to="/robot-status" style="font-size:13px;">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="8" cy="6" r="3"/>
        <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
      </svg>
      Robot status
      <span class="admin-badge">Admin</span>
    </RouterLink>

    <RouterLink class="nav-item" to="/create-task">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="8" cy="8" r="6"/>
        <path d="M8 5v3l2 2"/>
      </svg>
      Create task
    </RouterLink>

    <RouterLink class="nav-item" to="/task-history">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M2 4h12M2 8h8M2 12h10"/>
      </svg>
      Task history
    </RouterLink>

    <RouterLink class="nav-item" to="/logs">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="2" width="12" height="12" rx="1"/>
        <path d="M5 6h6M5 9h4"/>
      </svg>
      Logs
    </RouterLink>

    <RouterLink class="nav-item" to="/settings">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="8" cy="8" r="2"/>
        <path d="M8 2v2M8 12v2M2 8h2M12 8h2"/>
      </svg>
      Settings
    </RouterLink>

    <RouterLink class="nav-item" to="/shelf-management">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="5" width="12" height="8" rx="1"/>
        <path d="M5 5V4a3 3 0 016 0v1"/>
      </svg>
      Shelf management
    </RouterLink>

    <RouterLink v-if="isAdmin" class="nav-item" to="/users">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="6" cy="5" r="2.5"/>
        <path d="M1 13c0-2.8 2.2-5 5-5"/>
        <circle cx="12" cy="7" r="2"/>
        <path d="M10 13c0-1.7 1-3 2-3s2 1.3 2 3"/>
      </svg>
      User management
      <span class="admin-badge">Admin</span>
    </RouterLink>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuth } from '../composables/useAuth'

const { user } = useAuth()
const isAdmin = computed(() => user.value?.role === 'admin')
</script>
