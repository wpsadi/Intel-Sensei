import { ThemeProvider } from 'next-themes'
import { type ReactNode, Suspense, lazy } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import { SNoteSkeleton } from '@/features/note/components/SNoteSkeleton'
import { DrawSkeleton } from '@/features/s-draw/components/draw-skeleton'
import MainLayout from '@/layouts/main.layout'
import ErrorPage from '@/pages/error.page'
import HomePage from '@/pages/home.page'
import NotFoundPage from '@/pages/not-found.page'

// Each app is its own chunk, fetched when its route opens. Importing them all here made every visit, even the home page,
// download Ask Sensei, S3D, S-Design and S-Browse (several MB) before anything could show.
const S3DLayout = lazy(() => import('@/layouts/s-3d.layout'))
const AiUsagePage = lazy(() => import('@/pages/ai-usage.page'))
const AskSenseiPage = lazy(() => import('@/pages/ask-sensei.page'))
const S3DPage = lazy(() => import('@/pages/s-3d.page'))
const SBrowsePage = lazy(() => import('@/pages/s-browse.page'))
const SDesignPage = lazy(() => import('@/pages/s-design.page'))
// The editor pulls in Tiptap, KaTeX, Mermaid and Leaflet; load it only on /s-note.
const SNotePage = lazy(() => import('@/pages/s-note.page'))
const FirecrawlOAuthPage = lazy(() => import('@/pages/firecrawl-oauth.page'))
const SDrawPage = lazy(() => import('@/pages/s-draw.page'))
// Published S3D files open full-screen, outside the app shell.
const S3DEmbedPage = lazy(() => import('@/pages/s-3d-embed.page'))

/** Shown while a route's code downloads. */
const loading = (node: ReactNode) => (
  <Suspense
    fallback={
      <div role="status" aria-label="Loading" className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    }
  >
    {node}
  </Suspense>
)

const router = createBrowserRouter([
  {
    element: <MainLayout />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '/mcp/firecrawl/callback',
        element: (
          <Suspense fallback={<div role="status">Connecting Firecrawl…</div>}>
            <FirecrawlOAuthPage />
          </Suspense>
        ),
      },

      {
        path: '/ask-sensei',
        element: loading(<AskSenseiPage />),
        children: [{ index: true }, { path: ':chatId' }],
      },
      { path: '/ai-usage', element: loading(<AiUsagePage />) },
      { path: '/s-browse', element: loading(<SBrowsePage />) },
      {
        path: '/s-draw',
        element: (
          <Suspense fallback={<DrawSkeleton />}>
            <SDrawPage />
          </Suspense>
        ),
      },
      {
        path: '/s-note',
        element: (
          <Suspense fallback={<SNoteSkeleton />}>
            <SNotePage />
          </Suspense>
        ),
      },
      {
        path: '/s-note/:pageId',
        element: (
          <Suspense fallback={<SNoteSkeleton />}>
            <SNotePage />
          </Suspense>
        ),
      },
      {
        path: '/s-design',
        element: loading(<S3DLayout service="design" key="design" />),
        children: [{ index: true, element: loading(<SDesignPage />) }],
      },
      {
        path: '/s-3d',
        element: loading(<S3DLayout service="3d" key="3d" />),
        children: [{ index: true, element: loading(<S3DPage />) }],
      },
    ],
  },
  {
    path: '/s-3d/embed',
    element: (
      <Suspense>
        <S3DEmbedPage />
      </Suspense>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
])

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}

export default App
