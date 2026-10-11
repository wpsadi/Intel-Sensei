import { create } from 'zustand'

export type S3DDialog = 'export' | 'share' | 'versions' | 'open' | 'video' | 'shortcuts' | 'discover' | null

/** Which S3D dialog is open. Menus and shortcuts open them; `<S3DDialogs />` renders them. */
export const useS3DDialog = create<{ open: S3DDialog; setOpen: (open: S3DDialog) => void }>()((set) => ({
  open: null,
  setOpen: (open) => set({ open }),
}))
