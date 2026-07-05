import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpc } from './ipc.js';
import { CodexExecManager } from './codexExecManager.js';
import { SessionStore } from './sessionStore.js';
import { buildMainWindowOptions } from './windowOptions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

const sessions = new SessionStore();
const codexManager = new CodexExecManager(sessions);

registerIpc(codexManager, sessions);

async function createWindow(): Promise<void> {
  const window = new BrowserWindow(buildMainWindowOptions(path.join(__dirname, '../preload/index.js')));

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
    return;
  }

  await window.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('Failed to create Codex Desktop window:', error);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
