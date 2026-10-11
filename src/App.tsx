import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import HomePage from '@/pages/home.page'
import AskSenseiPage from '@/pages/ask-sensei.page'
import MainLayout from '@/layouts/main.layout'
import NotFoundPage from '@/pages/not-found.page'
import S3DLayout from '@/layouts/s-3d.layout'
import S3DPage from '@/pages/s-3d.page'
import SDesignPage from '@/pages/s-design.page'
import ErrorPage from '@/pages/error.page'
import { ThemeProvider } from 'next-themes'
import { Suspense, lazy } from 'react'

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
      { path: '/s-note', element: <Suspense><SNotePage /></Suspense> },
      { path: '/s-note/:pageId', element: <Suspense><SNotePage /></Suspense> },
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
  { path: '/s-3d/embed', element: <Suspense><S3DEmbedPage /></Suspense> },
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
