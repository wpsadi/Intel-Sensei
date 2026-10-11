import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import HomePage from '@/pages/home.page'
import AskSenseiPage from '@/pages/ask-sensei.page'
import MainLayout from '@/layouts/main.layout'
import NotFoundPage from '@/pages/not-found.page'
import ErrorPage from '@/pages/error.page'
import { ThemeProvider } from 'next-themes'
import { Suspense, lazy } from 'react'

// The editor pulls in Tiptap, KaTeX, Mermaid and Leaflet; load it only on /s-note.
const SNotePage = lazy(() => import('@/pages/s-note.page'))

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
    ],
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
