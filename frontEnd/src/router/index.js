import { createRouter, createWebHashHistory } from 'vue-router'
import DashboardView       from '../views/DashboardView.vue'
import RobotStatusView     from '../views/RobotStatusView.vue'
import CreateTaskView      from '../views/CreateTaskView.vue'
import TaskHistoryView     from '../views/TaskHistoryView.vue'
import LogsView            from '../views/LogsView.vue'
import SettingsView        from '../views/SettingsView.vue'
import ShelfManagementView from '../views/ShelfManagementView.vue'
import LoginView           from '../views/LoginView.vue'
import UserManagementView  from '../views/UserManagementView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },

  { path: '/',                 name: 'dashboard',        component: DashboardView },
  { path: '/robot-status',     name: 'robot-status',     component: RobotStatusView,     meta: { role: 'admin' } },
  { path: '/create-task',      name: 'create-task',      component: CreateTaskView },
  { path: '/task-history',     name: 'task-history',     component: TaskHistoryView },
  { path: '/logs',             name: 'logs',             component: LogsView },
  { path: '/settings',         name: 'settings',         component: SettingsView },
  { path: '/shelf-management', name: 'shelf-management', component: ShelfManagementView },
  { path: '/users',            name: 'users',            component: UserManagementView, meta: { role: 'admin' } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!to.meta.public && !token) return { name: 'login' }
  if (to.meta.public && token) return { name: 'dashboard' }
  if (to.meta.role) {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user?.role !== to.meta.role) return { name: 'dashboard' }
  }
})

export default router
