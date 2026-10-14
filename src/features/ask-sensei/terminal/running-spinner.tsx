import { AiOutlineLoading3Quarters } from 'react-icons/ai'

import { cn } from '@/lib/utils'

/** The spinner shown wherever a command is running. */
export function RunningSpinner({ className }: { className?: string }) {
  return <AiOutlineLoading3Quarters role="status" aria-label="A command is running" className={cn('size-3.5 animate-spin', className)} />
}
