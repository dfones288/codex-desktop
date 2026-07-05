import type { BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';

export function buildMainWindowOptions(preloadPath = path.join(process.cwd(), 'dist/preload/index.js'), platform: NodeJS.Platform = process.platform): BrowserWindowConstructorOptions {
  const windowsOptions: BrowserWindowConstructorOptions = platform === 'win32' ? {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#111111', symbolColor: '#d8d8d8', height: 34 }
  } : {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 }
  };

  return {
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    ...windowsOptions,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}
