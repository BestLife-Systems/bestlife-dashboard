import { apiGet, apiPost, apiPatch, apiDelete } from './api'

export const fetchMeetingInstances  = ()         => apiGet('/meetings/instances')
export const generateMeetings       = (days=120) => apiPost(`/meetings/generate?days=${days}`, {})
export const fetchMeetingTemplates  = ()         => apiGet('/meetings/templates')
export const createMeetingTemplate  = (data)     => apiPost('/meetings/templates', data)
export const updateMeetingTemplate  = (id, data) => apiPatch(`/meetings/templates/${id}`, data)
export const deleteMeetingTemplate  = (id)       => apiDelete(`/meetings/templates/${id}`)
export const deleteMeetingInstance  = (id)       => apiDelete(`/meetings/instances/${id}`)
