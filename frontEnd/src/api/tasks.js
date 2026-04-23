import api from './client'

export const listTasks      = (params)      => api.get('/tasks', { params })
export const getTask        = (id)          => api.get(`/tasks/${id}`)
export const createTask     = (data)        => api.post('/tasks', data)
export const cancelTask     = (id)          => api.delete(`/tasks/${id}`)
export const verifyPickup   = (id, code)    => api.post(`/tasks/${id}/verify-pickup`,   { code })
export const verifyDelivery = (id, code)    => api.post(`/tasks/${id}/verify-delivery`, { code })
export const resumeTask     = (id)          => api.post(`/tasks/${id}/resume`)
