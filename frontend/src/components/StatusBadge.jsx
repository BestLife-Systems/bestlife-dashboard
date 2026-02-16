export default function StatusBadge({ status }) {
  const config = {
    pending: { label: 'Pending', className: 'badge--warning' },
    approved: { label: 'Approved', className: 'badge--success' },
    paid: { label: 'Paid', className: 'badge--info' },
    rejected: { label: 'Rejected', className: 'badge--danger' },
    active: { label: 'Active', className: 'badge--success' },
    inactive: { label: 'Inactive', className: 'badge--muted' },
    draft: { label: 'Draft', className: 'badge--muted' },
  }

  const c = config[status] || { label: status, className: 'badge--muted' }

  return <span className={`badge ${c.className}`}>{c.label}</span>
}
