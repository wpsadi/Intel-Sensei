import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      server: {
        deps: { inline: ['@excalidraw/excalidraw', 'open-color'] },
      },
    },
  }),
)
