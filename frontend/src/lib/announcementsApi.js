import { apiGet, apiPost, apiPatch, apiDelete } from './api'

export const fetchAnnouncements   = ()         => apiGet('/announcements')
export const createAnnouncement   = (data)     => apiPost('/announcements', data)
export const updateAnnouncement   = (id, data) => apiPatch(`/announcements/${id}`, data)
export const deleteAnnouncement   = (id)       => apiDelete(`/announcements/${id}`)
