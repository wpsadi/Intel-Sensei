import { FileIcon, FileTextIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { useMediaUrl } from '../../db/hooks'
import { isMediaRef } from '../../db/media'
import { lucideIcon } from '../../lib/page-icons'
import { hasText } from './page-utils'

/** An uploaded image used as a page icon. */
function MediaIcon({ src, className }: { src: string; className?: string }) {
  const url = useMediaUrl(src)
  return url ? <img src={url} alt="" className={cn('size-4 rounded-sm object-cover', className)} /> : <span className={className} />
}

/** The page's emoji if set; otherwise a filled-page icon for pages with text and a blank-page icon for empty ones. */
export function PageIcon({ icon, content, className }: { icon?: string; content?: string; className?: string }) {
  if (icon && isMediaRef(icon)) return <MediaIcon src={icon} className={className} />
  const Lucide = lucideIcon(icon)
  // oxlint-disable-next-line react/static-components -- lucideIcon returns a stable module-level icon from PAGE_ICONS, not a component created per render
  if (Lucide) return <Lucide className={cn('size-4 text-muted-foreground', className)} />
  if (icon) return <span className={className}>{icon}</span>
  const Icon = content !== undefined && !hasText(content) ? FileIcon : FileTextIcon
  return <Icon className="size-4 text-muted-foreground" />
}
