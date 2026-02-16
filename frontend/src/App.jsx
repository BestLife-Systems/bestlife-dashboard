import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
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

// Therapist pages
import TherapistStats from './pages/therapist/TherapistStats'
import TherapistInvoices from './pages/therapist/TherapistInvoices'
import TherapistTimeOff from './pages/therapist/TherapistTimeOff'

// Clinical Leader pages
import ClinicalSupervisees from './pages/clinical/ClinicalSupervisees'
import ClinicalSupervision from './pages/clinical/ClinicalSupervision'

// Shared pages
import KnowledgeBase from './pages/shared/KnowledgeBase'

const ADMIN_TABS = [
  { path: '/admin/analytics', label: 'Analytics', icon: '📊' },
  { path: '/admin/payroll', label: 'Payroll', icon: '💰' },
  { path: '/admin/users', label: 'Users', icon: '👥' },
  { path: '/admin/knowledge-base', label: 'Knowledge Base', icon: '📚' },
  { path: '/admin/settings', label: 'Settings', icon: '⚙️' },
]

const THERAPIST_TABS = [
  { path: '/therapist/stats', label: 'My Stats', icon: '🏠' },
  { path: '/therapist/invoices', label: 'Invoices', icon: '💼' },
  { path: '/therapist/time-off', label: 'Time Off', icon: '🏖️' },
  { path: '/therapist/knowledge-base', label: 'Knowledge Base', icon: '📚' },
]

const CLINICAL_TABS = [
  { path: '/clinical/stats', label: 'My Stats', icon: '🏠' },
  { path: '/clinical/supervisees', label: 'Supervisees', icon: '👨‍⚕️' },
  { path: '/clinical/supervision', label: 'Supervision', icon: '📝' },
  { path: '/clinical/invoices', label: 'Invoices', icon: '💼' },
  { path: '/clinical/time-off', label: 'Time Off', icon: '🏖️' },
  { path: '/clinical/knowledge-base', label: 'Knowledge Base', icon: '📚' },
]

function RoleRouter() {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  if (!profile) return <Navigate to="/login" replace />

  switch (profile.role) {
    case 'admin':
      return <Navigate to="/admin/analytics" replace />
    case 'clinical_leader':
      return <Navigate to="/clinical/stats" replace />
    case 'therapist':
    default:
      return <Navigate to="/therapist/stats" replace />
  }
}

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

          {/* Admin Routes */}
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
          <Route path="/admin/knowledge-base" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><KnowledgeBase /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Layout tabs={ADMIN_TABS}><AdminSettings /></Layout>
            </ProtectedRoute>
          } />

          {/* Therapist Routes */}
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
          <Route path="/therapist/knowledge-base" element={
            <ProtectedRoute allowedRoles={['therapist']}>
              <Layout tabs={THERAPIST_TABS}><KnowledgeBase /></Layout>
            </ProtectedRoute>
          } />

          {/* Clinical Leader Routes */}
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
          <Route path="/clinical/knowledge-base" element={
            <ProtectedRoute allowedRoles={['clinical_leader']}>
              <Layout tabs={CLINICAL_TABS}><KnowledgeBase /></Layout>
            </ProtectedRoute>
          } />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
