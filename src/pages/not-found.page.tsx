import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from 'cn'

function NotFoundPage() {
  return (
    <section className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link to="/" className={cn(buttonVariants(), 'mt-4')}>
        Back to home
      </Link>
    </section>
  )
}

export default NotFoundPage
