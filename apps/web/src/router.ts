/**
 * TanStack Router Configuration
 * Code-based routing with type-safe routes
 */

import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routes/__root'

// Create the router instance
export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
