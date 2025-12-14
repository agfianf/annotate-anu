import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'

// Create a client for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Auth
import DashboardLayout from './components/DashboardLayout'
import FirstUserCheck from './components/FirstUserCheck'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import { ExploreViewProvider } from './contexts/ExploreViewContext'

// Public pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'

// Protected pages
import AdminPage from './pages/AdminPage'
import DashboardPage from './pages/DashboardPage'
import FileSharePage from './pages/FileSharePage'
import JobsPage from './pages/JobsPage'
import ProfilePage from './pages/ProfilePage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectsPage from './pages/ProjectsPage'
import TasksPage from './pages/TasksPage'

// Existing pages
import AnnotationApp from './pages/AnnotationApp'
import ModelConfigPage from './pages/ModelConfigPage'

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected dashboard routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="admin"
          element={
            <ProtectedRoute adminOnly>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/tasks" element={<TasksPage />} />
        <Route path="projects/:projectId/tasks/:taskId" element={<JobsPage />} />
        <Route path="tasks/:taskId/jobs" element={<JobsPage />} />
        <Route path="files" element={<FileSharePage />} />
      </Route>

      {/* Existing routes */}
      <Route path="/app" element={<AnnotationApp />} />
      <Route path="/models" element={<ModelConfigPage />} />
    </Routes>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ExploreViewProvider>
            <FirstUserCheck>
              <App />
            </FirstUserCheck>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  background: 'rgba(255, 255, 255, 0.95)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(229, 231, 235, 0.8)',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                },
              }}
            />
          </ExploreViewProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

