import { useState, useEffect } from 'react'
import { apiUpload, apiGet } from '../../lib/api'

export default function AdminSettings() {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [error, setError] = useState('')
  const [lastUpload, setLastUpload] = useState(null)

  useEffect(() => {
    apiGet('/settings/last-upload').then(setLastUpload).catch(() => {})
  }, [])

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an .xlsx or .xls file')
      return
    }

    setError('')
    setUploadResult(null)
    setUploading(true)

    try {
      const result = await apiUpload('/upload/therapynotes', file)
      setUploadResult(result)
      setLastUpload({ uploaded_at: new Date().toISOString(), filename: file.name })
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Settings</h2>
      </div>

      {/* TherapyNotes Upload */}
      <div className="card">
        <h3 className="card-title">TherapyNotes Data Upload</h3>
        <p className="card-description">
          Upload a TherapyNotes Billing Transactions export (.xlsx) to update analytics data.
          This will process the file and update therapist metrics.
        </p>

        {lastUpload && (
          <div className="settings-info">
            <div className="settings-info-row">
              <span className="settings-info-label">Last Upload</span>
              <span className="settings-info-value">
                {new Date(lastUpload.uploaded_at).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            {lastUpload.filename && (
              <div className="settings-info-row">
                <span className="settings-info-label">File</span>
                <span className="settings-info-value">{lastUpload.filename}</span>
              </div>
            )}
          </div>
        )}

        <div className="upload-zone">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleUpload}
            disabled={uploading}
            id="therapynotes-upload"
            className="upload-input"
          />
          <label htmlFor="therapynotes-upload" className={`upload-label ${uploading ? 'upload-label--disabled' : ''}`}>
            {uploading ? (
              <>
                <div className="loading-spinner loading-spinner--small" />
                <span>Processing file...</span>
              </>
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Click to upload TherapyNotes .xlsx file</span>
              </>
            )}
          </label>
        </div>

        {error && <div className="form-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {uploadResult && (
          <div className="upload-result">
            <div className="upload-result-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Upload Complete
            </div>
            <div className="settings-info">
              <div className="settings-info-row">
                <span className="settings-info-label">Transactions Processed</span>
                <span className="settings-info-value">{uploadResult.transactions_count?.toLocaleString()}</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-info-label">Therapists Found</span>
                <span className="settings-info-value">{uploadResult.therapist_count}</span>
              </div>
              <div className="settings-info-row">
                <span className="settings-info-label">Date Range</span>
                <span className="settings-info-value">{uploadResult.date_range}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title">System Info</h3>
        <div className="settings-info">
          <div className="settings-info-row">
            <span className="settings-info-label">Platform</span>
            <span className="settings-info-value">BestLife Hub v1.0</span>
          </div>
          <div className="settings-info-row">
            <span className="settings-info-label">Backend</span>
            <span className="settings-info-value">FastAPI + Supabase</span>
          </div>
          <div className="settings-info-row">
            <span className="settings-info-label">Hosting</span>
            <span className="settings-info-value">Railway</span>
          </div>
        </div>
      </div>
    </div>
  )
}
