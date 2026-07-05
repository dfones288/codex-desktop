import type { CodexDesktopApi } from '../shared/types.js';

declare global {
  interface Window {
    codexDesktop: CodexDesktopApi;
  }
}

export {};
