/**
 * Root Route and Route Tree
 * Defines all routes using TanStack Router code-based routing
 */

import {
  createRootRouteWithContext,
  createRoute,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'
import type { QueryClient } from '@tanstack/react-query'
import type { User } from '../lib/api-client'

// Context providers that need router access
import { ExploreViewProvider } from '../contexts/ExploreViewContext'

// Lazy load page components
import LandingPage from '../pages/LandingPage'
import LoginPage from '../pages/LoginPage'
import RegisterPage from '../pages/RegisterPage'
import AnimationDemoPage from '../pages/AnimationDemoPage'
import AnnotationApp from '../pages/AnnotationApp'
import DashboardLayout from '../components/DashboardLayout'
import DashboardPage from '../pages/DashboardPage'
import ProfilePage from '../pages/ProfilePage'
import AdminPage from '../pages/AdminPage'
import ProjectsPage from '../pages/ProjectsPage'
import ProjectDetailPage from '../pages/ProjectDetailPage'
import TasksPage from '../pages/TasksPage'
import JobsPage from '../pages/JobsPage'
import FileSharePage from '../pages/FileSharePage'
import ModelConfigPage from '../pages/ModelConfigPage'

// ============================================================================
// Context Types
// ============================================================================

export interface AuthContext {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export interface RouterContext {
  auth: AuthContext
  queryClient: QueryClient
}

// ============================================================================
// Search Schemas (Zod validation)
// ============================================================================

// Login page can receive redirect URL
const loginSearchSchema = z.object({
  redirect: z.string().optional(),
})

// Project detail page tabs
const projectDetailSearchSchema = z.object({
  tab: z.enum(['readme', 'tasks', 'configuration', 'history', 'explore']).default('readme').catch('readme'),
  fullview: z.coerce.boolean().optional(),
})

// Annotation app
const annotateSearchSchema = z.object({
  jobId: z.string().optional(),
})

// ============================================================================
// Loading Components
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-gray-500">Loading...</p>
      </div>
    </div>
  )
}

// ============================================================================
// Root Route
// ============================================================================

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  pendingComponent: LoadingSpinner,
})

function RootLayout() {
  return (
    <ExploreViewProvider>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </ExploreViewProvider>
  )
}

// ============================================================================
// Public Routes
// ============================================================================

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: LandingPage,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: loginSearchSchema,
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage,
})

const animationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/animations',
  component: AnimationDemoPage,
})

const annotateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/annotate',
  validateSearch: annotateSearchSchema,
  component: AnnotationApp,
})

// ============================================================================
// Authenticated Layout Route
// ============================================================================

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: async ({ context, location }) => {
    // Wait for auth to initialize
    if (context.auth.isLoading) {
      return
    }
    // Redirect to login if not authenticated
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
  pendingComponent: LoadingSpinner,
  component: () => <Outlet />,
})

// ============================================================================
// Dashboard Routes
// ============================================================================

const dashboardLayoutRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/dashboard',
  component: DashboardLayout,
})

const dashboardIndexRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/',
  component: DashboardPage,
})

const dashboardProfileRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/profile',
  component: ProfilePage,
})

const dashboardAdminRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/admin',
  beforeLoad: ({ context }) => {
    // Admin-only route guard
    if (context.auth.user?.role !== 'admin') {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: AdminPage,
})

const dashboardProjectsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/projects',
  component: ProjectsPage,
})

const dashboardProjectDetailRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/projects/$projectId',
  validateSearch: projectDetailSearchSchema,
  component: ProjectDetailPage,
})

const dashboardProjectTasksRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/projects/$projectId/tasks',
  component: TasksPage,
})

const dashboardProjectTaskJobsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/projects/$projectId/tasks/$taskId',
  component: JobsPage,
})

const dashboardTaskJobsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/tasks/$taskId/jobs',
  component: JobsPage,
})

const dashboardFilesRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/files',
  component: FileSharePage,
})

const dashboardModelsRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/models',
  component: ModelConfigPage,
})

// ============================================================================
// Route Tree
// ============================================================================

export const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  animationsRoute,
  annotateRoute,
  authenticatedRoute.addChildren([
    dashboardLayoutRoute.addChildren([
      dashboardIndexRoute,
      dashboardProfileRoute,
      dashboardAdminRoute,
      dashboardProjectsRoute,
      dashboardProjectDetailRoute,
      dashboardProjectTasksRoute,
      dashboardProjectTaskJobsRoute,
      dashboardTaskJobsRoute,
      dashboardFilesRoute,
      dashboardModelsRoute,
    ]),
  ]),
])
