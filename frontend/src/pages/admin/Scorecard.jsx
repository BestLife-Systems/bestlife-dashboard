import { useLoadingVerb } from '../../hooks/useLoadingVerb'

export default function Scorecard() {
  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Scorecard</h2>
      </div>
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <h3>Coming Soon</h3>
        <p>The Scorecard will bring together key performance indicators across Marketing, HR, and Finance into one unified view.</p>
      </div>
    </div>
  )
}
