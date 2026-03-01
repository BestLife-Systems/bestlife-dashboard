import { apiGet, apiPost, apiPatch, apiDelete } from './api'

export const fetchMyInstances    = ()           => apiGet('/tasks/instances')
export const updateInstanceStatus = (id, status) => apiPatch(`/tasks/instances/${id}`, { status })
export const fetchTemplates      = ()           => apiGet('/tasks/templates')
export const createTemplate      = (data)       => apiPost('/tasks/templates', data)
export const updateTemplate      = (id, data)   => apiPatch(`/tasks/templates/${id}`, data)
export const deleteTemplate      = (id)         => apiDelete(`/tasks/templates/${id}`)
export const generateInstances   = (days = 30)  => apiPost(`/tasks/generate?days=${days}`, {})
