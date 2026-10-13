import {
  BoxIcon, CircleIcon, Columns3Icon, FrameIcon, GroupIcon, HashIcon, ImageIcon, MessageCircleIcon, PentagonIcon, Rows3Icon,
  ScissorsIcon, SplineIcon, SquareDashedIcon, SquareIcon, SquaresExcludeIcon, SquaresIntersectIcon, SquaresSubtractIcon, SquaresUniteIcon, StarIcon, TypeIcon, VideoIcon,
} from 'lucide-react'
import type { SNode } from '@/features/s-3d/types'

export function NodeIcon({ node, className }: { node: SNode; className?: string }) {
  const p = { className }
  if (node.mask) return <ScissorsIcon {...p} />
  switch (node.type) {
    case 'frame':
      if (node.autoLayout) return node.autoLayout.direction === 'horizontal' ? <Columns3Icon {...p} /> : <Rows3Icon {...p} />
      return node.parentId && node.children.length === 0 && node.fills.length ? <HashIcon {...p} /> : <FrameIcon {...p} />
    case 'section': return <SquareDashedIcon {...p} />
    case 'group': return <GroupIcon {...p} />
    case 'rect': return <SquareIcon {...p} />
    case 'ellipse': return <CircleIcon {...p} />
    case 'polygon': return <PentagonIcon {...p} />
    case 'star': return <StarIcon {...p} />
    case 'vector': return <SplineIcon {...p} />
    case 'text': return <TypeIcon {...p} />
    case 'image': return <ImageIcon {...p} />
    case 'video': return <VideoIcon {...p} />
    case 'shape3d':
    case 'model3d': return <BoxIcon {...p} />
    case 'comment': return <MessageCircleIcon {...p} />
    case 'boolean':
      return node.booleanOp === 'subtract' ? <SquaresSubtractIcon {...p} /> : node.booleanOp === 'intersect' ? <SquaresIntersectIcon {...p} /> : node.booleanOp === 'exclude' ? <SquaresExcludeIcon {...p} /> : <SquaresUniteIcon {...p} />
  }
}
