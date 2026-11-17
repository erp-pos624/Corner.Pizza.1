import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'CornerPOS',
    executableName: 'corner-pos',
    appBundleId: 'com.cornerpizza.pos',
    appCopyright: 'Corner Pizza',
    icon: './build/icon',
    extraResource: ['build/icon.png'],
  },
  rebuildConfig: {},
  makers: [
    // Windows installer for LAN terminals.
    new MakerSquirrel({
      name: 'corner_pos',
      authors: 'Corner Pizza',
      setupExe: 'CornerPOS-Setup.exe',
      setupIcon: './build/icon.ico',
      noMsi: true,
    }),
    // Portable ZIP for a quick second-terminal rollout.
    new MakerZIP({}, ['win32', 'darwin', 'linux']),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
