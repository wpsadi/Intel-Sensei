import { ThemeProvider } from 'next-themes'
import { Suspense, lazy } from 'react'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import { SNoteSkeleton } from '@/features/note/components/SNoteSkeleton'
import MainLayout from '@/layouts/main.layout'
import S3DLayout from '@/layouts/s-3d.layout'
import AiUsagePage from '@/pages/ai-usage.page'
import AskSenseiPage from '@/pages/ask-sensei.page'
import ErrorPage from '@/pages/error.page'
import HomePage from '@/pages/home.page'
import NotFoundPage from '@/pages/not-found.page'
import S3DPage from '@/pages/s-3d.page'
import SDesignPage from '@/pages/s-design.page'

// The editor pulls in Tiptap, KaTeX, Mermaid and Leaflet; load it only on /s-note.
const SNotePage = lazy(() => import('@/pages/s-note.page'))
// Published S3D files open full-screen, outside the app shell.
const S3DEmbedPage = lazy(() => import('@/pages/s-3d-embed.page'))

const router = createBrowserRouter([
  {
    element: <MainLayout />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '/ask-sensei',
        element: <AskSenseiPage />,
        children: [{ index: true }, { path: ':chatId' }],
      },
      { path: '/ai-usage', element: <AiUsagePage /> },
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
        element: <S3DLayout service="design" key="design" />,
        children: [{ index: true, element: <SDesignPage /> }],
      },
      {
        path: '/s-3d',
        element: <S3DLayout service="3d" key="3d" />,
        children: [{ index: true, element: <S3DPage /> }],
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
