import { atomBlock } from './block-utils'
import { AiView, ButtonView } from './views/actions'

export const ButtonBlock = atomBlock('buttonBlock', { label: 'New button', action: 'insert', payload: '' }, ButtonView)
export const AiBlock = atomBlock('aiBlock', { prompt: '', output: '' }, AiView)
