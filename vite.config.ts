import fs from 'node:fs';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { clientSecretGuard, assertPublicEnvironment } from './scripts/buildSecurity';

// Provider credentials stay exclusively in server routes or macOS Keychain.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  assertPublicEnvironment(env);
  const bundledModules = new Set<string>();
  const licenseInventory = (writeInventory: boolean): Plugin => ({
    name: 'bundled-license-inventory',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const [file, info] of Object.entries(output.modules)) {
          if (info.renderedLength > 0) bundledModules.add(file);
        }
      }
      if (writeInventory) {
        fs.mkdirSync('.build', { recursive: true });
        fs.writeFileSync('.build/web-modules.json', JSON.stringify([...bundledModules]));
      }
    },
  });
  return {
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react(), clientSecretGuard(env), licenseInventory(true)],
  worker: { plugins: () => [licenseInventory(false)] },
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'index.html'),
        share: path.resolve(__dirname, 'share.html'),
        generate: path.resolve(__dirname, 'generate.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  };
});
