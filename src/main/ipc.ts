import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { listCodexHistoriesByCwd, listCodexProjectCandidates } from './codexHistory.js';
import { listCodexModels } from './codexModels.js';
import { getCodexBootstrapStatus, installCodexCli } from './codexBootstrap.js';
import { CodexExecManager } from './codexExecManager.js';
import { listGitBranches, switchGitBranch } from './gitBranches.js';
import { disableSkill, enableSkill, getSkillDetail, listLocalSkills, openSkillFolder, uninstallSkill } from './skillStore.js';
import { SessionStore } from './sessionStore.js';
import type { OpenExternalTargetRequest, ProjectFileInfo, ReadLocalImageRequest, ReadLocalImageResult, ResumeSessionRequest, SavePastedImageRequest, SendInputRequest, StartSessionRequest, StopSessionRequest, SwitchGitBranchRequest } from '../shared/types.js';

export const channels = {
  startSession: 'codex:start-session',
  resumeSession: 'codex:resume-session',
  sendInput: 'codex:send-input',
  stopSession: 'codex:stop-session',
  getSession: 'codex:get-session',
  listHistories: 'codex:list-histories',
  listModels: 'codex:list-models',
  listSkills: 'codex:list-skills',
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

export function registerIpc(codexManager: CodexExecManager, sessions: SessionStore): void {
  ipcMain.handle(channels.startSession, async (_event, request: StartSessionRequest) => codexManager.start(request));
  ipcMain.handle(channels.resumeSession, async (_event, request: ResumeSessionRequest) => codexManager.resume(request));
  ipcMain.handle(channels.sendInput, async (_event, request: SendInputRequest) => codexManager.sendInput(request));
  ipcMain.handle(channels.stopSession, async (_event, request: StopSessionRequest) => codexManager.stop(request));
  ipcMain.handle(channels.getSession, async (_event, sessionId: string) => sessions.get(sessionId));
  ipcMain.handle(channels.listHistories, async (_event, cwd: string) => listCodexHistoriesByCwd(cwd));
  ipcMain.handle(channels.listModels, async () => listCodexModels());
  ipcMain.handle(channels.getCodexBootstrapStatus, async () => getCodexBootstrapStatus());
  ipcMain.handle(channels.installCodexCli, async () => installCodexCli((payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.output, { sessionId: 'bootstrap', chunk: payload.message, role: 'system' });
  }));
  ipcMain.handle(channels.restartApp, async () => {
    app.relaunch();
    app.exit(0);
  });
  ipcMain.handle(channels.listSkills, async () => listLocalSkills());
  ipcMain.handle(channels.getSkillDetail, async (_event, skillId: string) => getSkillDetail(skillId));
  ipcMain.handle(channels.setSkillEnabled, async (_event, request: { skillId: string; enabled: boolean }) => {
    if (request.enabled) await enableSkill(request.skillId);
    else await disableSkill(request.skillId);
    return listLocalSkills();
  });
  ipcMain.handle(channels.uninstallSkill, async (_event, skillId: string) => {
    await uninstallSkill(skillId);
    return listLocalSkills();
  });
  ipcMain.handle(channels.openSkillFolder, async (_event, skillId: string) => {
    const folder = await openSkillFolder(skillId);
    if (folder) shell.showItemInFolder(path.join(folder, 'SKILL.md'));
  });
  ipcMain.handle(channels.listHistoryProjects, async () => listCodexProjectCandidates());
  ipcMain.handle(channels.listProjectFiles, async (_event, cwd: string) => listProjectFiles(cwd));
  ipcMain.handle(channels.listGitBranches, async (_event, cwd: string) => listGitBranches(cwd).catch(() => ({ current: '', branches: [] })));
  ipcMain.handle(channels.switchGitBranch, async (_event, request: SwitchGitBranchRequest) => switchGitBranch(request.cwd, request.branch));
  ipcMain.handle(channels.savePastedImage, async (_event, request: SavePastedImageRequest) => savePastedImage(request));
  ipcMain.handle(channels.readLocalImage, async (_event, request: ReadLocalImageRequest) => readLocalImage(request));
  ipcMain.handle(channels.openExternalTarget, async (_event, request: OpenExternalTargetRequest) => openExternalTarget(request));

  ipcMain.handle(channels.selectDirectory, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Select project directory for Codex' });
    return { canceled: result.canceled, path: result.filePaths[0] };
  });
  ipcMain.handle(channels.selectFiles, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: 'Attach files for Codex' });
    return {
      canceled: result.canceled,
      files: result.filePaths.map((filePath) => ({
        path: filePath,
        name: path.basename(filePath),
        kind: isImagePath(filePath) ? 'image' : 'file'
      }))
    };
  });

  codexManager.on('output', (payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.output, payload);
  });
  codexManager.on('exit', (payload) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channels.exit, payload);
  });
}

async function openExternalTarget(request: OpenExternalTargetRequest): Promise<void> {
  const target = request.target.trim();
  if (!target) return;
  if (/^https?:\/\//i.test(target)) {
    await shell.openExternal(target);
    return;
  }
  const filePath = target.startsWith('file://') ? new URL(target).pathname : target;
  shell.showItemInFolder(path.resolve(filePath));
}

function isImagePath(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)$/i.test(filePath);
}

async function listProjectFiles(cwd: string): Promise<ProjectFileInfo[]> {
  const root = path.resolve(cwd);
  const files = await findProjectFiles(root, root);
  return files.slice(0, 600);
}

async function findProjectFiles(root: string, current: string): Promise<ProjectFileInfo[]> {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage']);
  const nested = await Promise.all(entries.map(async (entry) => {
    if (ignored.has(entry.name)) return [];
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) return findProjectFiles(root, fullPath);
    if (!entry.isFile()) return [];
    const relativePath = path.relative(root, fullPath);
    return [{ path: fullPath, relativePath }];
  }));
  return nested.flat().sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function readLocalImage(request: ReadLocalImageRequest): Promise<ReadLocalImageResult> {
  try {
    const buffer = await fs.readFile(request.path);
    const extension = path.extname(request.path).slice(1).toLowerCase();
    const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png';
    return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return { missing: true };
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function savePastedImage(request: SavePastedImageRequest): Promise<{ path: string; name: string }> {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(request.dataUrl);
  if (!match) throw new Error('Unsupported pasted image data');

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const directory = path.join(os.tmpdir(), 'codex-desktop-pasted-images');
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `codex-paste-${Date.now()}-${randomUUID()}.${extension}`);
  await fs.writeFile(filePath, Buffer.from(match[2], 'base64'));
  return { path: filePath, name: request.name?.trim() || 'Image' };
}
