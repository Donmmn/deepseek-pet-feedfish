import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    'core/index': 'src/core/index.ts',
    'widget/index': 'src/widget/index.ts',
    'server/index': 'src/server/index.ts',
    'tui/index': 'src/tui/index.ts',
    'dsh/index': 'src/dsh/index.ts',
    'desktop/main': 'src/desktop/main.ts',
  },
  format: ['esm'],
  platform: 'neutral',
  target: 'es2022',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['electron', '@deepseek-ai/cordis', '@deepseek-ai/dsh-session'],
})

