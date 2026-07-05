export type SessionStatus = 'idle' | 'running' | 'error';

export type MessageRole = 'user' | 'codex' | 'system';

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'extra-high';

export type CodexReasoningLevel = ReasoningEffort;

export type PermissionMode = 'default' | 'full-access';

export interface SessionMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: string;
}

export interface CodexSession {
  id: string;
  cwd: string;
  status: SessionStatus;
  messages: SessionMessage[];
  model: string;
  reasoningEffort: ReasoningEffort;
  permissionMode: PermissionMode;
  webSearch: boolean;
  codexConversationId?: string;
  exitCode?: number;
  error?: string;
  startedAt: string;
  updatedAt: string;
}


export interface CodexThreadHistory {
  id: string;
  cwd: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  filePath: string;
}

export interface CodexModelInfo {
  slug: string;
  defaultReasoningLevel?: CodexReasoningLevel;
  supportedReasoningLevels: CodexReasoningLevel[];
}

export interface ResumeSessionRequest {
  cwd: string;
  codexConversationId: string;
  title: string;
  filePath?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionMode?: PermissionMode;
}

export interface StartSessionRequest {
  cwd: string;
  command?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  webSearch?: boolean;
}

export interface SendInputRequest {
  sessionId: string;
  input: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  permissionMode?: PermissionMode;
  webSearch?: boolean;
  skipUserAppend?: boolean;
}

export interface ReadLocalImageRequest {
  path: string;
}

export interface ReadLocalImageResult {
  dataUrl?: string;
  missing?: boolean;
}

export interface StopSessionRequest {
  sessionId: string;
}

export interface CodexOutputEvent {
  sessionId: string;
  chunk: string;
  role: Extract<MessageRole, 'codex' | 'system'>;
}

export interface CodexExitEvent {
  sessionId: string;
  exitCode?: number;
  signal?: number;
  status: SessionStatus;
  error?: string;
  session?: CodexSession;
}

export interface SelectDirectoryResult {
  canceled: boolean;
  path?: string;
}

export interface SelectFilesResult {
  canceled: boolean;
  files: Array<{ path: string; name: string; kind: 'image' | 'file' }>;
}

export interface CodexBootstrapStatus {
  installed: boolean;
  platform: string;
  missing: string[];
  canInstall: boolean;
}

export interface CodexInstallLogEvent {
  level: 'info' | 'success' | 'error';
  message: string;
}

export interface SavePastedImageRequest {
  dataUrl: string;
  name?: string;
}

export interface SavePastedImageResult {
  path: string;
  name: string;
}

export interface CodexSkillInfo {
  id: string;
  name: string;
  description?: string;
  source: string;
  enabled?: boolean;
}

export interface CodexSkillDetail extends CodexSkillInfo {
  path: string;
  sourceRoot: string;
  enabled: boolean;
  installType: 'skills' | 'superpowers';
  frontmatter: Record<string, string>;
  content: string;
}

export interface ProjectFileInfo {
  path: string;
  relativePath: string;
}

export interface CodexProjectCandidate {
  id: string;
  name: string;
  path: string;
  lastUsedAt: string;
  threadCount: number;
}

export interface OpenExternalTargetRequest {
  target: string;
}

export interface GitBranchInfo {
  current: string;
  branches: Array<{ name: string; current: boolean }>;
  status?: GitBranchStatus;
}

export interface GitBranchStatus {
  uncommittedFiles: number;
  added: number;
  removed: number;
}

export interface SwitchGitBranchRequest {
  cwd: string;
  branch: string;
}

export interface CodexDesktopApi {
  startSession(request: StartSessionRequest): Promise<CodexSession>;
  sendInput(request: SendInputRequest): Promise<void>;
  stopSession(request: StopSessionRequest): Promise<void>;
  getSession(sessionId: string): Promise<CodexSession | undefined>;
  resumeSession(request: ResumeSessionRequest): Promise<CodexSession>;
  listHistories(cwd: string): Promise<CodexThreadHistory[]>;
  listModels(): Promise<CodexModelInfo[]>;
  listSkills(): Promise<CodexSkillInfo[]>;
  getSkillDetail(skillId: string): Promise<CodexSkillDetail | undefined>;
  setSkillEnabled(skillId: string, enabled: boolean): Promise<CodexSkillInfo[]>;
  uninstallSkill(skillId: string): Promise<CodexSkillInfo[]>;
  openSkillFolder(skillId: string): Promise<void>;
  listHistoryProjects(): Promise<CodexProjectCandidate[]>;
  listProjectFiles(cwd: string): Promise<ProjectFileInfo[]>;
  listGitBranches(cwd: string): Promise<GitBranchInfo>;
  switchGitBranch(request: SwitchGitBranchRequest): Promise<GitBranchInfo>;
  selectDirectory(): Promise<SelectDirectoryResult>;
  selectFiles(): Promise<SelectFilesResult>;
  getCodexBootstrapStatus(): Promise<CodexBootstrapStatus>;
  installCodexCli(): Promise<CodexBootstrapStatus>;
  restartApp(): Promise<void>;
  savePastedImage(request: SavePastedImageRequest): Promise<SavePastedImageResult>;
  readLocalImage(request: ReadLocalImageRequest): Promise<ReadLocalImageResult>;
  openExternalTarget(request: OpenExternalTargetRequest): Promise<void>;
  onOutput(callback: (event: CodexOutputEvent) => void): () => void;
  onExit(callback: (event: CodexExitEvent) => void): () => void;
}
