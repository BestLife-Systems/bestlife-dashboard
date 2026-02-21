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

// ── Nav Tabs ──────────────────────────────────────────────────────
// `section` items are rendered as labels/dividers, not links

const ADMIN_TABS = [
  { path: '/home',                  label: 'Home',            icon: '🏠' },
  { section: 'Workspace' },
  { path: '/my-work',              label: 'My Work',          icon: '✅' },
  { path: '/knowledge-base',       label: 'Knowledge Base',   icon: '🧠' },
  { section: 'Admin' },
  { path: '/admin/analytics',      label: 'Analytics',        icon: '📊' },
  { path: '/admin/payroll',        label: 'Payroll',          icon: '💰' },
  { path: '/admin/users',          label: 'Users',            icon: '👥' },
  { path: '/admin/task-templates', label: 'Task Templates',   icon: '🗓️' },
  { section: 'System' },
  { path: '/admin/settings',       label: 'Settings',         icon: '⚙️' },
]

const THERAPIST_TABS = [
  { path: '/home',                label: 'Home',            icon: '🏠' },
  { section: 'My Practice' },
  { path: '/therapist/stats',    label: 'My Stats',         icon: '📊' },
  { path: '/therapist/invoices', label: 'Invoices',          icon: '💼' },
  { path: '/therapist/time-off', label: 'Time Off',          icon: '🏖️' },
  { section: 'Workspace' },
  { path: '/my-work',            label: 'My Work',           icon: '✅' },
  { path: '/knowledge-base',     label: 'Knowledge Base',    icon: '🧠' },
]

const CLINICAL_TABS = [
  { path: '/home',                  label: 'Home',            icon: '🏠' },
  { section: 'My Practice' },
  { path: '/clinical/stats',       label: 'My Stats',         icon: '📊' },
  { path: '/clinical/invoices',    label: 'Invoices',         icon: '💼' },
  { path: '/clinical/time-off',    label: 'Time Off',         icon: '🏖️' },
  { section: 'Clinical' },
  { path: '/clinical/supervisees', label: 'Supervisees',      icon: '👨‍⚕️' },
  { path: '/clinical/supervision', label: 'Supervision',      icon: '📝' },
  { section: 'Workspace' },
  { path: '/my-work',              label: 'My Work',          icon: '✅' },
  { path: '/knowledge-base',       label: 'Knowledge Base',   icon: '🧠' },
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
          <Route path="/my-work" element={
            <ProtectedRoute>
              <SharedLayout><MyWork /></SharedLayout>
            </ProtectedRoute>
          } />
          <Route path="/knowledge-base" element={
            <ProtectedRoute>
              <SharedLayout><KnowledgeBase /></SharedLayout>
            </ProtectedRoute>
          } />

          {/* ── Admin Routes ── */}
          <Route path="/admin/analytics" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminAnalytics /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/payroll" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminPayroll /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminUsers /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/task-templates" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminTaskTemplates /></Layout>
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
