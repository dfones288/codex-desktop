import { contextBridge, ipcRenderer } from 'electron';
import type { CodexDesktopApi, CodexExitEvent, CodexOutputEvent, DeleteHistoryRequest, OpenExternalTargetRequest, ReadLocalImageRequest, ResumeSessionRequest, SavePastedImageRequest, SendInputRequest, StartSessionRequest, StopSessionRequest, SwitchGitBranchRequest } from '../shared/types.js';

const channels = {
  startSession: 'codex:start-session',
  resumeSession: 'codex:resume-session',
  sendInput: 'codex:send-input',
  stopSession: 'codex:stop-session',
  getSession: 'codex:get-session',
  listHistories: 'codex:list-histories',
  listModels: 'codex:list-models',
  listSkills: 'codex:list-skills',
  deleteHistory: 'codex:delete-history',
  getSkillDetail: 'codex:get-skill-detail',
  setSkillEnabled: 'codex:set-skill-enabled',
  uninstallSkill: 'codex:uninstall-skill',
  openSkillFolder: 'codex:open-skill-folder',
  listHistoryProjects: 'codex:list-history-projects',
  listProjectFiles: 'codex:list-project-files',
  listGitBranches: 'codex:list-git-branches',
  switchGitBranch: 'codex:switch-git-branch',
  savePastedImage: 'codex:save-pasted-image',
  readLocalImage: 'codex:read-local-image',
  openExternalTarget: 'codex:open-external-target',
  selectDirectory: 'codex:select-directory',
  selectFiles: 'codex:select-files',
  getCodexBootstrapStatus: 'codex:get-bootstrap-status',
  installCodexCli: 'codex:install-cli',
  restartApp: 'codex:restart-app',
  output: 'codex:output',
  exit: 'codex:exit'
} as const;

const api: CodexDesktopApi = {
  startSession: (request: StartSessionRequest) => ipcRenderer.invoke(channels.startSession, request),
  resumeSession: (request: ResumeSessionRequest) => ipcRenderer.invoke(channels.resumeSession, request),
  sendInput: (request: SendInputRequest) => ipcRenderer.invoke(channels.sendInput, request),
  stopSession: (request: StopSessionRequest) => ipcRenderer.invoke(channels.stopSession, request),
  getSession: (sessionId: string) => ipcRenderer.invoke(channels.getSession, sessionId),
  listHistories: (cwd: string) => ipcRenderer.invoke(channels.listHistories, cwd),
  deleteHistory: (request: DeleteHistoryRequest) => ipcRenderer.invoke(channels.deleteHistory, request),
  listModels: () => ipcRenderer.invoke(channels.listModels),
  listSkills: () => ipcRenderer.invoke(channels.listSkills),
  getSkillDetail: (skillId: string) => ipcRenderer.invoke(channels.getSkillDetail, skillId),
  setSkillEnabled: (skillId: string, enabled: boolean) => ipcRenderer.invoke(channels.setSkillEnabled, { skillId, enabled }),
  uninstallSkill: (skillId: string) => ipcRenderer.invoke(channels.uninstallSkill, skillId),
  openSkillFolder: (skillId: string) => ipcRenderer.invoke(channels.openSkillFolder, skillId),
  listHistoryProjects: () => ipcRenderer.invoke(channels.listHistoryProjects),
  listProjectFiles: (cwd: string) => ipcRenderer.invoke(channels.listProjectFiles, cwd),
  listGitBranches: (cwd: string) => ipcRenderer.invoke(channels.listGitBranches, cwd),
  switchGitBranch: (request: SwitchGitBranchRequest) => ipcRenderer.invoke(channels.switchGitBranch, request),
  savePastedImage: (request: SavePastedImageRequest) => ipcRenderer.invoke(channels.savePastedImage, request),
  readLocalImage: (request: ReadLocalImageRequest) => ipcRenderer.invoke(channels.readLocalImage, request),
  openExternalTarget: (request: OpenExternalTargetRequest) => ipcRenderer.invoke(channels.openExternalTarget, request),
  selectDirectory: () => ipcRenderer.invoke(channels.selectDirectory),
  selectFiles: () => ipcRenderer.invoke(channels.selectFiles),
  getCodexBootstrapStatus: () => ipcRenderer.invoke(channels.getCodexBootstrapStatus),
  installCodexCli: () => ipcRenderer.invoke(channels.installCodexCli),
  restartApp: () => ipcRenderer.invoke(channels.restartApp),
  onOutput: (callback: (event: CodexOutputEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CodexOutputEvent) => callback(event);
    ipcRenderer.on(channels.output, listener);
    return () => ipcRenderer.off(channels.output, listener);
  },
  onExit: (callback: (event: CodexExitEvent) => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: CodexExitEvent) => callback(event);
    ipcRenderer.on(channels.exit, listener);
    return () => ipcRenderer.off(channels.exit, listener);
  }
};

contextBridge.exposeInMainWorld('codexDesktop', api);
