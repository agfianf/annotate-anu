/**
 * Root Route and Route Tree
 * Defines all routes using TanStack Router code-based routing
 */

import {
  createRootRouteWithContext,
  createRoute,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Loader2 } from '@/components/ui/icons'
import { z } from 'zod'
import type { QueryClient } from '@tanstack/react-query'
import type { User } from '../lib/api-client'

// Context providers that need router access
import { ExploreViewProvider } from '../contexts/ExploreViewContext'

// Page components are code-split per route. Each import() becomes its own chunk,
// so the entry bundle only carries the router, auth, and shared UI.
// `defaultPreload: 'intent'` in router.ts starts fetching a chunk on link hover.
const DashboardLayout = lazyRouteComponent(() => import('../components/DashboardLayout'))
const LandingPage = lazyRouteComponent(() => import('../pages/LandingPage'))
const LoginPage = lazyRouteComponent(() => import('../pages/LoginPage'))
const RegisterPage = lazyRouteComponent(() => import('../pages/RegisterPage'))
const AnimationDemoPage = lazyRouteComponent(() => import('../pages/AnimationDemoPage'))
const AnnotationApp = lazyRouteComponent(() => import('../pages/AnnotationApp'))
const QCPage = lazyRouteComponent(() => import('../pages/QCPage'))
const StoragePage = lazyRouteComponent(() => import('../pages/StoragePage'))
const DashboardPage = lazyRouteComponent(() => import('../pages/DashboardPage'))
const ProfilePage = lazyRouteComponent(() => import('../pages/ProfilePage'))
const AdminPage = lazyRouteComponent(() => import('../pages/AdminPage'))
const ProjectsPage = lazyRouteComponent(() => import('../pages/ProjectsPage'))
const ProjectDetailPage = lazyRouteComponent(() => import('../pages/ProjectDetailPage'))
const TasksPage = lazyRouteComponent(() => import('../pages/TasksPage'))
const JobsPage = lazyRouteComponent(() => import('../pages/JobsPage'))
const FileSharePage = lazyRouteComponent(() => import('../pages/FileSharePage'))
const ModelConfigPage = lazyRouteComponent(() => import('../pages/ModelConfigPage'))

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
const qcSearchSchema = z.object({
  sessionId: z.string().optional(),
  projectId: z.string().optional(),
})

const annotateSearchSchema = z.object({
  jobId: z.coerce.string().optional(),
  imageId: z.string().optional(),
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
  path: '/annotation',
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
    // Check both React state AND localStorage (for immediate post-login navigation)
    // This handles the race condition where setUser() hasn't updated yet but token is saved
    const hasToken = !!localStorage.getItem('access_token');
    if (!context.auth.isAuthenticated && !hasToken) {
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

const dashboardQCRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/qc',
  validateSearch: qcSearchSchema,
  component: QCPage,
})

const dashboardStorageRoute = createRoute({
  getParentRoute: () => dashboardLayoutRoute,
  path: '/storage',
  component: StoragePage,
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
      dashboardQCRoute,
      dashboardStorageRoute,
      dashboardModelsRoute,
    ]),
  ]),
])
