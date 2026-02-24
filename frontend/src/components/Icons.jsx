// Futuristic line-art SVG icons for sidebar navigation
// All icons: 18x18, stroke-based, consistent weight

const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconHome(props) {
  return <svg {...s} {...props}><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><polyline points="9 21 9 14 15 14 15 21" /></svg>
}

export function IconCheckSquare(props) {
  return <svg {...s} {...props}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 12l2 2 4-4" /></svg>
}

export function IconBrain(props) {
  return <svg {...s} {...props}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" /><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" /></svg>
}

export function IconBarChart(props) {
  return <svg {...s} {...props}><rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="3" width="4" height="18" rx="1" /></svg>
}

export function IconDollar(props) {
  return <svg {...s} {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /><path d="M15 9.5c0-.83-1.34-1.5-3-1.5s-3 .67-3 1.5S10.34 11 12 11s3 .67 3 1.5-1.34 1.5-3 1.5-3-.67-3-1.5" /></svg>
}

export function IconUsers(props) {
  return <svg {...s} {...props}><circle cx="9" cy="7" r="3" /><path d="M3 21v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" /><circle cx="17" cy="9" r="2.5" /><path d="M21 21v-1a3.5 3.5 0 0 0-3-3.46" /></svg>
}

export function IconCalendar(props) {
  return <svg {...s} {...props}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 9h18" /><circle cx="8" cy="14" r="1" /><circle cx="12" cy="14" r="1" /><circle cx="16" cy="14" r="1" /></svg>
}

export function IconSettings(props) {
  return <svg {...s} {...props}><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
}

export function IconBriefcase(props) {
  return <svg {...s} {...props}><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><path d="M2 12h20" /></svg>
}

export function IconPalmTree(props) {
  return <svg {...s} {...props}><path d="M12 22V10" /><path d="M6 10c0-4 2.5-6 6-8 3.5 2 6 4 6 8" /><path d="M6 10c2 1 4 1 6 0s4-1 6 0" /></svg>
}

export function IconUserCheck(props) {
  return <svg {...s} {...props}><circle cx="9" cy="7" r="3.5" /><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 2 .35" /><path d="M16 18l2 2 4-4" /></svg>
}

export function IconClipboard(props) {
  return <svg {...s} {...props}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3h6v2H9z" /><path d="M9 11h6M9 15h4" /></svg>
}

export function IconMegaphone(props) {
  return <svg {...s} {...props}><path d="M3 11l18-5v12L3 13v-2z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
}
