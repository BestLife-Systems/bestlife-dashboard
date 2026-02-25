import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { useLoadingVerb } from './hooks/useLoadingVerb'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import UnauthorizedPage from './pages/UnauthorizedPage'

// Admin pages
import AdminAnalytics from './pages/admin/AdminAnalytics'
import AdminPayroll from './pages/admin/AdminPayroll'
import AdminUsers from './pages/admin/AdminUsers'
import AdminSettings from './pages/admin/AdminSettings'
import AdminTaskTemplates from './pages/admin/AdminTaskTemplates'
import AdminMeetings from './pages/admin/AdminMeetings'
import AdminAnnouncements from './pages/admin/AdminAnnouncements'

// New admin pages — Payroll sub-pages
import PayPeriods from './pages/admin/PayPeriods'
import ApprovalQueue from './pages/admin/ApprovalQueue'
import ExportBatches from './pages/admin/ExportBatches'
import RateCatalog from './pages/admin/RateCatalog'

// New admin pages — Users sub-pages
import UserPayRates from './pages/admin/UserPayRates'
import ClinicalLeaderAssignment from './pages/admin/ClinicalLeaderAssignment'

// New admin pages — Analytics sub-pages
import HoursMargin from './pages/admin/HoursMargin'
import PerformanceTracking from './pages/admin/PerformanceTracking'
import SupervisionCompliance from './pages/admin/SupervisionCompliance'

// Therapist pages
import TherapistStats from './pages/therapist/TherapistStats'
import TherapistInvoices from './pages/therapist/TherapistInvoices'
import TherapistTimeOff from './pages/therapist/TherapistTimeOff'

// Clinical Leader pages
import ClinicalSupervisees from './pages/clinical/ClinicalSupervisees'
import ClinicalSupervision from './pages/clinical/ClinicalSupervision'

// Shared pages
import Home from './pages/shared/Home'
import KnowledgeBase from './pages/shared/KnowledgeBase'
import MyWork from './pages/shared/MyWork'

// Public pages (no auth required)
import PublicInvoice from './pages/public/PublicInvoice'

// Icons
import {
  IconHome, IconCheckSquare, IconBrain, IconBarChart, IconDollar,
  IconUsers, IconCalendar, IconSettings, IconBriefcase, IconPalmTree,
  IconUserCheck, IconClipboard, IconMegaphone, IconClock, IconTrendingUp,
  IconShield, IconFileText, IconInbox, IconDownload, IconTag, IconCreditCard,
} from './components/Icons'

// ── Nav Tabs ──────────────────────────────────────────────────────
// `section` items are rendered as labels/dividers, not links
// `children` items render as collapsible sub-menu under a parent
// `icon` is a React element (SVG component)

const ADMIN_TABS = [
  { path: '/home', label: 'Home', icon: <IconHome /> },
  { path: '/knowledge-base', label: 'Knowledge Base', icon: <IconBrain /> },
  { section: 'Admin' },
  {
    label: 'Analytics', icon: <IconBarChart />, children: [
      { path: '/admin/analytics/hours-margin', label: 'Hours & Margin' },
      { path: '/admin/analytics/performance', label: 'Performance Tracking' },
      { path: '/admin/analytics/supervision', label: 'Supervision Compliance' },
    ],
  },
  {
    label: 'Payroll', icon: <IconDollar />, children: [
      { path: '/admin/payroll/pay-periods', label: 'Pay Periods' },
      { path: '/admin/payroll/approval-queue', label: 'Approval Queue' },
      { path: '/admin/payroll/export-batches', label: 'Export Batches' },
      { path: '/admin/payroll/rate-catalog', label: 'Rate Catalog' },
    ],
  },
  {
    label: 'Users', icon: <IconUsers />, children: [
      { path: '/admin/users', label: 'All Users' },
      { path: '/admin/users/pay-rates', label: 'Pay Rates' },
      { path: '/admin/users/clinical-assignments', label: 'Clinical Leader Assignment' },
    ],
  },
]

const THERAPIST_TABS = [
  { path: '/home', label: 'Home', icon: <IconHome /> },
  { path: '/knowledge-base', label: 'Knowledge Base', icon: <IconBrain /> },
]

const CLINICAL_TABS = [
  { path: '/home', label: 'Home', icon: <IconHome /> },
  { path: '/knowledge-base', label: 'Knowledge Base', icon: <IconBrain /> },
]

const APN_TABS = [
  { path: '/home', label: 'Home', icon: <IconHome /> },
  { path: '/knowledge-base', label: 'Knowledge Base', icon: <IconBrain /> },
]

const FRONT_DESK_TABS = [
  { path: '/home', label: 'Home', icon: <IconHome /> },
  { path: '/knowledge-base', label: 'Knowledge Base', icon: <IconBrain /> },
]

// ── Role Router ───────────────────────────────────────────────────

function RoleRouter() {
  const { profile, loading } = useAuth()
  const verb = useLoadingVerb(loading)

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>{verb}…</p>
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />

  // All roles now go to /home
  return <Navigate to="/home" replace />
}

// Helper: get tabs for any role
function tabsForRole(role) {
  if (role === 'admin') return ADMIN_TABS
  if (role === 'clinical_leader') return CLINICAL_TABS
  if (role === 'apn') return APN_TABS
  if (role === 'front_desk') return FRONT_DESK_TABS
  return THERAPIST_TABS
}

// Shared layout: picks tabs based on current user role
function SharedLayout({ children }) {
  const { profile } = useAuth()
  const tabs = tabsForRole(profile?.role)
  return <Layout tabs={tabs}>{children}</Layout>
}

// ── App ───────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/invoice/:draftToken" element={<PublicInvoice />} />

          {/* Home redirect */}
          <Route path="/" element={
            <ProtectedRoute>
              <RoleRouter />
            </ProtectedRoute>
          } />

          {/* ── Shared routes (all authenticated roles) ── */}
          <Route path="/home" element={
            <ProtectedRoute>
              <SharedLayout><Home /></SharedLayout>
            </ProtectedRoute>
          } />
          <Route path="/knowledge-base" element={
            <ProtectedRoute>
              <SharedLayout><KnowledgeBase /></SharedLayout>
            </ProtectedRoute>
          } />

          {/* ── Admin Routes — Analytics ── */}
          <Route path="/admin/analytics/hours-margin" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><HoursMargin /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/analytics/performance" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><PerformanceTracking /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/analytics/supervision" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><SupervisionCompliance /></Layout>
            </ProtectedRoute>
          } />
          {/* Legacy analytics redirect */}
          <Route path="/admin/analytics" element={<Navigate to="/admin/analytics/hours-margin" replace />} />

          {/* ── Admin Routes — Payroll ── */}
          <Route path="/admin/payroll/pay-periods" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><PayPeriods /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/payroll/approval-queue" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><ApprovalQueue /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/payroll/export-batches" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><ExportBatches /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/payroll/rate-catalog" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><RateCatalog /></Layout>
            </ProtectedRoute>
          } />
          {/* Legacy payroll redirect */}
          <Route path="/admin/payroll" element={<Navigate to="/admin/payroll/pay-periods" replace />} />

          {/* ── Admin Routes — Users ── */}
          <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminUsers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/users/pay-rates" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><UserPayRates /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/users/clinical-assignments" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><ClinicalLeaderAssignment /></Layout>
            </ProtectedRoute>
          } />

          {/* ── Admin Routes — Other ── */}
          <Route path="/admin/task-templates" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminTaskTemplates /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/meetings" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminMeetings /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/announcements" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminAnnouncements /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminSettings /></Layout>
            </ProtectedRoute>
          } />

          {/* Legacy KB routes → redirect to canonical */}
          <Route path="/admin/knowledge-base" element={<Navigate to="/knowledge-base" replace />} />
          <Route path="/therapist/knowledge-base" element={<Navigate to="/knowledge-base" replace />} />
          <Route path="/clinical/knowledge-base" element={<Navigate to="/knowledge-base" replace />} />

          {/* Legacy My Work → redirect to home */}
          <Route path="/my-work" element={<Navigate to="/home" replace />} />

          {/* ── Therapist Routes ── */}
          <Route path="/therapist/stats" element={
            <ProtectedRoute allowedRoles={['therapist']}>
              <Layout tabs={THERAPIST_TABS}><TherapistStats /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/therapist/invoices" element={
            <ProtectedRoute allowedRoles={['therapist']}>
              <Layout tabs={THERAPIST_TABS}><TherapistInvoices /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/therapist/time-off" element={
            <ProtectedRoute allowedRoles={['therapist']}>
              <Layout tabs={THERAPIST_TABS}><TherapistTimeOff /></Layout>
            </ProtectedRoute>
          } />

          {/* ── Clinical Leader Routes ── */}
          <Route path="/clinical/stats" element={
            <ProtectedRoute allowedRoles={['clinical_leader']}>
              <Layout tabs={CLINICAL_TABS}><TherapistStats /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/clinical/supervisees" element={
            <ProtectedRoute allowedRoles={['clinical_leader']}>
              <Layout tabs={CLINICAL_TABS}><ClinicalSupervisees /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/clinical/supervision" element={
            <ProtectedRoute allowedRoles={['clinical_leader']}>
              <Layout tabs={CLINICAL_TABS}><ClinicalSupervision /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/clinical/invoices" element={
            <ProtectedRoute allowedRoles={['clinical_leader']}>
              <Layout tabs={CLINICAL_TABS}><TherapistInvoices /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/clinical/time-off" element={
            <ProtectedRoute allowedRoles={['clinical_leader']}>
              <Layout tabs={CLINICAL_TABS}><TherapistTimeOff /></Layout>
            </ProtectedRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
