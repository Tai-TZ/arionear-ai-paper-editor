import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { type ReactNode } from "react";

import arioAvatar from "../../assets/avatar/avatar-chat.png";
import appCss from "../styles.css?url";
import { AppNotFound } from "../components/app-not-found";
import { Toaster } from "../components/ui/sonner";
import { LocaleProvider } from "../components/locale-provider";
import { ThemeProvider } from "../components/theme-provider";
import { AppErrorFallback } from "../components/app-error-fallback";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arionear — Closer to Publication" },
      { name: "description", content: "AI editorial assistant for scientific manuscripts. Improve language, structure, citations, and reviewer responses — without inventing data." },
      { name: "author", content: "Arionear" },
      { property: "og:title", content: "Arionear — Closer to Publication" },
      { property: "og:description", content: "AI editorial assistant for scientific manuscripts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400&family=Lora:ital,wght@0,400;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: arioAvatar,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: AppNotFound,
  errorComponent: AppErrorFallback,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('arionear-theme');if(t==='dark')document.documentElement.classList.add('dark');var l=localStorage.getItem('arionear-locale');if(l==='vi')document.documentElement.lang='vi'}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <ThemeProvider>
      <LocaleProvider>
        <QueryClientProvider client={queryClient}>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-right" />
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
