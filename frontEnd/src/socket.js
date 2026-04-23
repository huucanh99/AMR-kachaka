import { io } from 'socket.io-client'

const socket = io({
  path: '/socket.io',
  autoConnect: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 3000,
})

/** Join the notification room for a specific task and role. */
export function joinTaskRoom(taskId, role) {
  socket.emit('user:join_task', { taskId, role })
}

/** Leave the notification room for a specific task and role. */
export function leaveTaskRoom(taskId, role) {
  socket.emit('user:leave_task', { taskId, role })
}

export default socket
