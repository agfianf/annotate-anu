/**
 * TanStack Router Configuration
 * Code-based routing with type-safe routes
 */

import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routes/__root'

// Create the router instance
// Note: Context (auth, queryClient) is provided by the App component
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  context: undefined!, // Will be set by RouterProvider
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
