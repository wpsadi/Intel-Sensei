import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from 'cn'

function ErrorPage() {
  const error = useRouteError()
  const isResponse = isRouteErrorResponse(error)
  const status = isResponse ? error.status : 500
  const title = isResponse ? `${error.status} ${error.statusText}` : 'Something went wrong'
  const message = isResponse
    ? error.data?.message ?? 'The page could not be loaded.'
    : 'An unexpected error occurred. Please try again.'

  return (
    <section role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">{status}</p>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md text-muted-foreground">{message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={cn(buttonVariants({ variant: 'outline' }))}
        >
          Try again
        </button>
        <Link to="/" className={cn(buttonVariants())}>
          Back to home
        </Link>
      </div>
    </section>
  )
}

export default ErrorPage
