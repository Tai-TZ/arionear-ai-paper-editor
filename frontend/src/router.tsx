import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Fetch a route's code chunk when a <Link> is hovered/focused. No route has a loader (data
    // goes through react-query / the API clients), so a preload only adds beforeLoad: the auth
    // guards read localStorage (the /admin guard also checks /auth/me), and a guard redirect
    // during a preload only preloads its target — it never navigates. Stale time 0 leaves
    // caching to react-query.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
