import api from './client'

export const getRobotStatus = ()          => api.get('/robot/status')
export const getMovingShelf = ()          => api.get('/robot/moving-shelf')
export const getLocations   = ()          => api.get('/robot/locations')
export const getShelves     = ()          => api.get('/robot/shelves')
export const getShelfLayers = (shelfId)   => api.get('/robot/shelf-layers', { params: { shelfId } })
export const getEvents      = (limit = 20)=> api.get('/robot/events', { params: { limit } })
export const createShelfLayer    = (data)               => api.post('/robot/shelf-layers', data)
export const updateShelfLayer    = (shelfId, layer, data)=> api.patch(`/robot/shelf-layers/${shelfId}/${layer}`, data)
export const setShelfLayerStatus = (shelfId, layer, status) =>
  api.patch(`/robot/shelf-layers/${shelfId}/${layer}`, { status })
export const returnHome     = ()          => api.post('/robot/return-home')
export const dockShelf      = ()          => api.post('/robot/dock-shelf')
export const undockShelf    = ()          => api.post('/robot/undock-shelf')
export const pauseRobot     = ()          => api.post('/robot/pause')
export const resumeRobot    = ()          => api.post('/robot/resume')
export const emergencyStop  = ()          => api.post('/robot/emergency-stop')
