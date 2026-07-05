export type WorkspaceView = 'chat' | 'skills';

export function viewAfterOpeningThread(_currentView: WorkspaceView): WorkspaceView {
  return 'chat';
}
