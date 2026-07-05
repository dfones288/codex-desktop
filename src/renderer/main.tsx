import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CodexBootstrapStatus, CodexModelInfo, CodexProjectCandidate, CodexReasoningLevel, CodexSession, CodexSkillDetail, CodexSkillInfo, CodexThreadHistory, GitBranchInfo, PermissionMode, ProjectFileInfo, ReasoningEffort, SessionMessage, SessionStatus } from '../shared/types.js';
import { diffLineClass, isMarkdownActivityText, normalizeTerminalText, splitActivitySegments } from './activitySegments.js';
import { filterBranches } from './branchSearch.js';
import { buildPromptWithAttachments, type ComposerAttachment, type ComposerFileReference, type ComposerSkillReference } from './composerAttachments.js';
import { tokenizeCode } from './codeHighlight.js';
import { composerTextareaHeight } from './composerTextarea.js';
import { visibleTranscriptMessages } from './displayMessages.js';
import { mergeOutputIntoMessages } from './messageMerge.js';
import { splitUserMessageParts } from './messageParts.js';
import { viewAfterOpeningThread } from './navigationState.js';
import { projectSelectorRows } from './projectSelector.js';
import { canContinueProjectOnboarding, shouldBlockSendWithoutProject, shouldOpenProjectOnboarding } from './projectOnboarding.js';
import { parseStoredProjectState } from './projectStateStorage.js';
import { addProject, removeProject, type ProjectEntry, type ProjectState } from './projects.js';
import { findProjectIdForSession, mergeSessionIntoProjectHistories } from './sessionHistory.js';
import { ensureExpandedProject, getProjectThreadRows, reconcileExpandedProjects, removeExpandedProject, toggleExpandedProject } from './projectThreads.js';
import './styles.css';

const defaultModel = 'gpt-5.5';
const projectsStorageKey = 'codex-desktop.projects.v1';

const reasoningOptions: Array<{ value: ReasoningEffort; label: string }> = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' }
];

const fallbackReasoningLevels: CodexReasoningLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const fallbackModels: CodexModelInfo[] = [{ slug: defaultModel, defaultReasoningLevel: 'high', supportedReasoningLevels: fallbackReasoningLevels }];
const emptyGitBranches: GitBranchInfo = { current: '', branches: [] };

const permissionOptions: Array<{ value: PermissionMode; label: string }> = [
  { value: 'default', label: 'Default permissions' },
  { value: 'full-access', label: 'Full access' }
];

function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'idle': return 'Ready';
    case 'running': return 'Thinking';
    case 'error': return 'Error';
  }
}

function reasoningOptionLabel(value: CodexReasoningLevel): string {
  return reasoningOptions.find((option) => option.value === value || (option.value === 'xhigh' && value === 'extra-high'))?.label ?? value;
}

function normalizeReasoningLevel(value: CodexReasoningLevel): ReasoningEffort {
  return value === 'extra-high' ? 'xhigh' : value;
}

function supportedReasoningForModel(modelInfo?: CodexModelInfo): ReasoningEffort[] {
  const levels = modelInfo?.supportedReasoningLevels.length ? modelInfo.supportedReasoningLevels : fallbackReasoningLevels;
  return levels.map(normalizeReasoningLevel).filter((level, index, all) => all.indexOf(level) === index);
}

function formatRelativeTime(iso: string): string {
  const deltaMs = Math.max(0, Date.now() - Date.parse(iso));
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read pasted image'));
    reader.readAsDataURL(file);
  });
}

function loadProjectState(): ProjectState {
  return parseStoredProjectState(localStorage.getItem(projectsStorageKey));
}

function normalizeProjectPath(value: string): string {
  return value.replace(/[\\/]+$/, '');
}

function App(): React.ReactElement {
  const [projectState, setProjectState] = useState<ProjectState>(() => loadProjectState());
  const [session, setSession] = useState<CodexSession | undefined>();
  const [sessionsById, setSessionsById] = useState<Record<string, CodexSession>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<ComposerSkillReference[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<ComposerFileReference[]>([]);
  const [availableSkills, setAvailableSkills] = useState<CodexSkillInfo[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'skills'>('chat');
  const [skillSearch, setSkillSearch] = useState('');
  const [selectedSkillDetail, setSelectedSkillDetail] = useState<CodexSkillDetail | undefined>();
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<ProjectFileInfo[]>([]);
  const [commandMenu, setCommandMenu] = useState<'skills' | 'files' | undefined>();
  const [branchInfoByProject, setBranchInfoByProject] = useState<Record<string, GitBranchInfo>>({});
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [inlineMenuOpen, setInlineMenuOpen] = useState<'model' | 'reasoning' | 'permission' | undefined>();
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const [projectSelectorPosition, setProjectSelectorPosition] = useState<{ top: number; left: number } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [model, setModel] = useState(defaultModel);
  const [availableModels, setAvailableModels] = useState<CodexModelInfo[]>(fallbackModels);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('full-access');
  const [bootstrapStatus, setBootstrapStatus] = useState<CodexBootstrapStatus | undefined>();
  const [bootstrapHelpOpen, setBootstrapHelpOpen] = useState(false);
  const [projectOnboardingOpen, setProjectOnboardingOpen] = useState(false);
  const [projectOnboardingDismissed, setProjectOnboardingDismissed] = useState(false);
  const [historyProjectCandidates, setHistoryProjectCandidates] = useState<CodexProjectCandidate[]>([]);
  const [selectedOnboardingProjectIds, setSelectedOnboardingProjectIds] = useState<Set<string>>(() => new Set());
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(() => new Set(projectState.activeProjectId ? [projectState.activeProjectId] : []));
  const [historiesByProject, setHistoriesByProject] = useState<Record<string, CodexThreadHistory[]>>({});
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const branchControlRef = useRef<HTMLDivElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const inlineMenuRef = useRef<HTMLDivElement | null>(null);
  const resizeComposerFrameRef = useRef<number | undefined>(undefined);
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | undefined>();
  const [projectMenuPosition, setProjectMenuPosition] = useState<{ top: number; left: number } | undefined>();
  const projectStateRef = useRef(projectState);
  const sessionRef = useRef<CodexSession | undefined>(session);
  const sessionsByIdRef = useRef<Record<string, CodexSession>>({});
  const activeSessionIdRef = useRef<string | undefined>(activeSessionId);
  const recentSessionsRef = useRef<Record<string, CodexSession>>({});

  const activeProject = useMemo(() => projectState.projects.find((project) => project.id === projectState.activeProjectId) ?? projectState.projects[0], [projectState]);
  const openProjectMenu = useMemo(() => projectState.projects.find((project) => project.id === openProjectMenuId), [openProjectMenuId, projectState.projects]);
  const gitBranches = activeProject ? branchInfoByProject[activeProject.id] ?? emptyGitBranches : emptyGitBranches;
  const selectedModelInfo = useMemo(() => availableModels.find((option) => option.slug === model), [availableModels, model]);
  const supportedReasoningOptions = useMemo(() => supportedReasoningForModel(selectedModelInfo), [selectedModelInfo]);
  const activeStatus = session?.status ?? 'idle';
  const canSend = activeStatus !== 'running' && (input.trim().length > 0 || attachments.length > 0 || selectedSkills.length > 0 || selectedFiles.length > 0);
  const currentTitle = session?.messages.find((message) => message.role === 'user')?.text.slice(0, 18) || 'New thread';
  const enabledSkills = useMemo(() => availableSkills.filter((skill) => skill.enabled !== false), [availableSkills]);

  useEffect(() => {
    projectStateRef.current = projectState;
    localStorage.setItem(projectsStorageKey, JSON.stringify(projectState));
  }, [projectState]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    void window.codexDesktop.listModels().then((models) => {
      const nextModels = models.length > 0 ? models : fallbackModels;
      setAvailableModels(nextModels);
      setModel((current) => nextModels.some((option) => option.slug === current) ? current : nextModels[0].slug);
    });
  }, []);

  useEffect(() => {
    void window.codexDesktop.getCodexBootstrapStatus().then((status) => {
      setBootstrapStatus(status);
      if (!status.installed) setBootstrapHelpOpen(true);
    }).catch(() => {
      setBootstrapStatus({ installed: false, platform: 'darwin', missing: ['Codex CLI'], canInstall: false });
      setBootstrapHelpOpen(true);
    });
  }, []);

  useEffect(() => {
    void window.codexDesktop.listSkills().then(setAvailableSkills);
  }, []);

  useEffect(() => {
    void window.codexDesktop.listHistoryProjects().then(setHistoryProjectCandidates).catch(() => setHistoryProjectCandidates([]));
  }, []);


  useEffect(() => {
    if (!activeProject) return;
    void window.codexDesktop.listProjectFiles(activeProject.path).then(setAvailableFiles);
    setBranchMenuOpen(false);
    setProjectSelectorOpen(false);
    setProjectSelectorPosition(undefined);
  }, [activeProject?.id, activeProject?.path]);

  useEffect(() => {
    if (projectState.projects.length > 0) {
      setProjectOnboardingOpen(false);
      setProjectOnboardingDismissed(false);
      return;
    }
    if (!projectOnboardingDismissed && shouldOpenProjectOnboarding(projectState.projects.length, projectOnboardingOpen)) {
      setProjectOnboardingOpen(true);
    }
  }, [projectOnboardingDismissed, projectOnboardingOpen, projectState.projects.length]);

  useEffect(() => {
    const projectKeys = new Set(projectState.projects.map((project) => project.id));
    setBranchInfoByProject((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([projectId]) => projectKeys.has(projectId)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    const cancelledProjectIds = new Set<string>();
    for (const project of projectState.projects) {
      void window.codexDesktop.listGitBranches(project.path).then((info) => {
        if (cancelledProjectIds.has(project.id)) return;
        setBranchInfoByProject((current) => ({ ...current, [project.id]: info }));
      });
    }
    return () => {
      for (const project of projectState.projects) cancelledProjectIds.add(project.id);
    };
  }, [projectState.projects.map((project) => `${project.id}\0${project.path}`).join('\0')]);

  useEffect(() => {
    if (!branchMenuOpen) return;
    function closeOnOutsidePointerDown(event: PointerEvent): void {
      if (branchControlRef.current?.contains(event.target as Node)) return;
      setBranchMenuOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!inlineMenuOpen) return;
    function closeInlineMenuOnOutsidePointerDown(event: PointerEvent): void {
      if (inlineMenuRef.current?.contains(event.target as Node)) return;
      setInlineMenuOpen(undefined);
    }
    document.addEventListener('pointerdown', closeInlineMenuOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeInlineMenuOnOutsidePointerDown, true);
  }, [inlineMenuOpen]);

  useEffect(() => {
    if (!openProjectMenuId) return;
    function closeProjectMenuOnOutsidePointerDown(event: PointerEvent): void {
      if (projectMenuRef.current?.contains(event.target as Node)) return;
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
    }
    document.addEventListener('pointerdown', closeProjectMenuOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeProjectMenuOnOutsidePointerDown, true);
  }, [openProjectMenuId]);

  useEffect(() => {
    if (supportedReasoningOptions.includes(reasoningEffort)) return;
    setReasoningEffort(normalizeReasoningLevel(selectedModelInfo?.defaultReasoningLevel ?? supportedReasoningOptions[0] ?? 'high'));
  }, [reasoningEffort, selectedModelInfo?.defaultReasoningLevel, supportedReasoningOptions]);

  useEffect(() => {
    setExpandedProjectIds((current) => reconcileExpandedProjects(current, projectState.projects.map((project) => project.id), activeProject?.id));
  }, [activeProject?.id, projectState.projects]);

  useEffect(() => {
    refreshAllProjectHistories();
  }, [projectState.projects]);

  useEffect(() => {
    const removeOutput = window.codexDesktop.onOutput((event) => {
      const current = sessionsByIdRef.current[event.sessionId];
      if (!current) return;
      const createdAt = new Date().toISOString();
      const messages = mergeOutputIntoMessages(current.messages, {
        id: `${event.sessionId}-${Date.now()}-${current.messages.length}`,
        role: event.role,
        chunk: event.chunk,
        createdAt
      });
      cacheSession({ ...current, messages, updatedAt: createdAt });
    });

    const removeExit = window.codexDesktop.onExit((event) => {
      const current = sessionsByIdRef.current[event.sessionId] ?? event.session;
      if (!current) return;
      const updatedAt = new Date().toISOString();
      const completedSession: CodexSession = {
        ...current,
        codexConversationId: event.session?.codexConversationId ?? current.codexConversationId,
        status: event.status,
        exitCode: event.exitCode,
        error: event.error,
        updatedAt: event.session?.updatedAt || updatedAt
      };
      cacheSession(completedSession);
      if (completedSession.codexConversationId) recentSessionsRef.current[completedSession.codexConversationId] = completedSession;
      mergeCompletedSessionHistory(completedSession);
      void refreshProjectHistories(completedSession.cwd);
    });

    return () => {
      removeOutput();
      removeExit();
    };
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [session?.messages]);

  useEffect(() => {
    scheduleComposerTextareaResize();
  }, [input, attachments.length, selectedSkills.length, selectedFiles.length, activeView]);

  useEffect(() => {
    window.addEventListener('resize', scheduleComposerTextareaResize);
    return () => {
      window.removeEventListener('resize', scheduleComposerTextareaResize);
      if (resizeComposerFrameRef.current !== undefined) window.cancelAnimationFrame(resizeComposerFrameRef.current);
    };
  }, []);

  function cacheSession(nextSession: CodexSession): void {
    const nextSessions = { ...sessionsByIdRef.current, [nextSession.id]: nextSession };
    sessionsByIdRef.current = nextSessions;
    setSessionsById(nextSessions);
    if (activeSessionIdRef.current === nextSession.id) {
      sessionRef.current = nextSession;
      setSession(nextSession);
    }
  }

  function activateSession(nextSession?: CodexSession): void {
    activeSessionIdRef.current = nextSession?.id;
    setActiveSessionId(nextSession?.id);
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (nextSession) {
      const nextSessions = { ...sessionsByIdRef.current, [nextSession.id]: nextSession };
      sessionsByIdRef.current = nextSessions;
      setSessionsById(nextSessions);
      if (nextSession.codexConversationId) recentSessionsRef.current[nextSession.codexConversationId] = nextSession;
    }
  }

  function sessionsForProject(project: ProjectEntry): CodexSession[] {
    return Object.values(sessionsById).filter((item) => normalizeProjectPath(item.cwd) === normalizeProjectPath(project.path));
  }

  function cachedSessionForHistory(project: ProjectEntry, history: CodexThreadHistory): CodexSession | undefined {
    return Object.values(sessionsByIdRef.current).find((item) => normalizeProjectPath(item.cwd) === normalizeProjectPath(project.path) && item.codexConversationId === history.id)
      ?? recentSessionsRef.current[history.id];
  }

  function openCachedSession(project: ProjectEntry, nextSession: CodexSession): void {
    setActiveView('chat');
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    setError(undefined);
    activateSession(nextSession);
  }

  function refreshAllProjectHistories(): void {
    for (const project of projectState.projects) {
      void refreshProjectHistories(project.path);
    }
  }

  async function refreshProjectHistories(projectPath: string): Promise<void> {
    const project = projectStateRef.current.projects.find((item) => item.path === projectPath);
    if (!project) return;
    const histories = await window.codexDesktop.listHistories(project.path);
    setHistoriesByProject((current) => {
      const projectCompletedSessions = Object.values(sessionsByIdRef.current)
        .filter((item) => item.status !== 'running' && normalizeProjectPath(item.cwd) === normalizeProjectPath(project.path));
      const mergedHistories = projectCompletedSessions.reduce(mergeSessionIntoProjectHistories, histories);
      return { ...current, [project.id]: mergedHistories };
    });
  }

  function mergeCompletedSessionHistory(completedSession: CodexSession): void {
    const projectId = findProjectIdForSession(projectStateRef.current.projects, completedSession);
    if (!projectId) return;
    setHistoriesByProject((current) => ({
      ...current,
      [projectId]: mergeSessionIntoProjectHistories(current[projectId] || [], completedSession)
    }));
  }

  function startNewThread(project = activeProject): void {
    if (!project) return;
    setActiveView('chat');
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    activateSession(undefined);
    setInput('');
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);
  }

  function selectProject(project: ProjectEntry): void {
    setActiveView('chat');
    setOpenProjectMenuId(undefined);
    setProjectMenuPosition(undefined);
    setProjectSelectorOpen(false);
    setProjectSelectorPosition(undefined);
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    activateSession(undefined);
    setInput('');
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);
  }

  function toggleProject(project: ProjectEntry): void {
    setExpandedProjectIds((current) => toggleExpandedProject(current, project.id));
  }

  async function openHistory(project: ProjectEntry, history: CodexThreadHistory): Promise<void> {
    setActiveView(viewAfterOpeningThread(activeView));
    setProjectState((current) => ({ ...current, activeProjectId: project.id }));
    setExpandedProjectIds((current) => ensureExpandedProject(current, project.id));
    setError(undefined);
    let targetHistory = history;
    const cachedSession = cachedSessionForHistory(project, history);
    if (cachedSession) {
      openCachedSession(project, cachedSession);
      void refreshProjectHistories(project.path);
      return;
    }
    if (!history.filePath) {
      const refreshedHistories = await window.codexDesktop.listHistories(project.path);
      setHistoriesByProject((current) => ({ ...current, [project.id]: refreshedHistories }));
      targetHistory = refreshedHistories.find((item) => item.id === history.id) ?? history;
    }
    const nextSession = await window.codexDesktop.resumeSession({
      cwd: project.path,
      codexConversationId: targetHistory.id,
      title: targetHistory.title,
      filePath: targetHistory.filePath,
      model,
      reasoningEffort,
      permissionMode
    });
    activateSession(nextSession);
  }

  async function addProjectFromPicker(): Promise<void> {
    const result = await window.codexDesktop.selectDirectory();
    if (!result.canceled && result.path) {
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
      setProjectSelectorOpen(false);
      setProjectSelectorPosition(undefined);
      setProjectState((current) => {
        const next = addProject(current, result.path!);
        setExpandedProjectIds((expanded) => next.activeProjectId ? ensureExpandedProject(expanded, next.activeProjectId) : expanded);
        return next;
      });
      activateSession(undefined);
      setProjectOnboardingOpen(false);
      setProjectOnboardingDismissed(false);
      setError(undefined);
    }
  }

  function addProjectsFromHistoryCandidates(): void {
    if (selectedOnboardingProjectIds.size === 0) return;
    setProjectState((current) => {
      let next = current;
      for (const candidate of historyProjectCandidates) {
        if (selectedOnboardingProjectIds.has(candidate.id)) next = addProject(next, candidate.path);
      }
      setExpandedProjectIds((expanded) => next.activeProjectId ? ensureExpandedProject(expanded, next.activeProjectId) : expanded);
      return next;
    });
    setSelectedOnboardingProjectIds(new Set());
    setProjectOnboardingOpen(false);
    setProjectOnboardingDismissed(false);
    setError(undefined);
  }

  function toggleOnboardingProject(projectId: string): void {
    setSelectedOnboardingProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleAllOnboardingProjects(): void {
    setSelectedOnboardingProjectIds((current) => {
      if (current.size === historyProjectCandidates.length) return new Set();
      return new Set(historyProjectCandidates.map((candidate) => candidate.id));
    });
  }

  function removeProjectById(projectId: string): void {
    setOpenProjectMenuId(undefined);
    setProjectMenuPosition(undefined);
    setExpandedProjectIds((current) => removeExpandedProject(current, projectId));
    setProjectState((current) => removeProject(current, projectId));
    const removedProject = projectStateRef.current.projects.find((project) => project.id === projectId);
    if (removedProject && sessionRef.current && normalizeProjectPath(sessionRef.current.cwd) === normalizeProjectPath(removedProject.path)) activateSession(undefined);
    setInput('');
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);
  }

  async function stopSession(): Promise<void> {
    if (!session) return;
    await window.codexDesktop.stopSession({ sessionId: session.id });
    cacheSession({ ...session, status: 'idle' });
  }

  async function sendPrompt(): Promise<void> {
    const prompt = buildPromptWithAttachments(input, { attachments, skills: selectedSkills, files: selectedFiles }).trim();
    if (!prompt || activeStatus === 'running') return;
    if (shouldBlockSendWithoutProject(projectState.projects.length) || !activeProject) {
      setProjectOnboardingOpen(true);
      return;
    }
    setInput('');
    setAttachments([]);
    setSelectedSkills([]);
    setSelectedFiles([]);
    setError(undefined);

    try {
      const targetSession = session ?? await window.codexDesktop.startSession({
        cwd: activeProject.path,
        model,
        reasoningEffort,
        permissionMode,
        webSearch: false
      });
      const optimisticMessage: SessionMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: prompt,
        createdAt: new Date().toISOString()
      };
      const runningSession: CodexSession = {
        ...targetSession,
        model,
        reasoningEffort,
        permissionMode,
        webSearch: false,
        status: 'running',
        messages: [...targetSession.messages, optimisticMessage],
        updatedAt: optimisticMessage.createdAt
      };
      activateSession(runningSession);
      await window.codexDesktop.sendInput({ sessionId: targetSession.id, input: prompt, model, reasoningEffort, permissionMode, webSearch: false, skipUserAppend: true });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      setError(message);
      if (sessionRef.current) cacheSession({ ...sessionRef.current, status: 'error', error: message });
    }
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt();
    }
  }

  function handleComposerChange(value: string): void {
    setInput(value);
    const last = value.at(-1);
    if (last === '/') setCommandMenu('skills');
    else if (last === '@') setCommandMenu('files');
    else if (commandMenu && !/[\/@][^\s]*$/.test(value)) setCommandMenu(undefined);
  }

  function scheduleComposerTextareaResize(): void {
    if (resizeComposerFrameRef.current !== undefined) window.cancelAnimationFrame(resizeComposerFrameRef.current);
    resizeComposerFrameRef.current = window.requestAnimationFrame(() => {
      resizeComposerFrameRef.current = undefined;
      resizeComposerTextarea();
    });
  }

  function resizeComposerTextarea(): void {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const next = composerTextareaHeight({
      scrollHeight: textarea.scrollHeight,
      containerHeight: workspaceRef.current?.clientHeight || window.innerHeight,
      minHeight: 38
    });
    textarea.style.height = `${next.height}px`;
    textarea.style.overflowY = next.overflowY;
  }

  async function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>): Promise<void> {
    const imageItems = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    event.preventDefault();
    for (const [index, item] of imageItems.entries()) {
      const file = item.getAsFile();
      if (!file) continue;
      const dataUrl = await readFileAsDataUrl(file);
      const saved = await window.codexDesktop.savePastedImage({ dataUrl, name: file.name || 'image.png' });
      setAttachments((current) => [...current, { id: `${Date.now()}-${index}-${saved.path}`, name: saved.name, path: saved.path, kind: 'image' }]);
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function selectSkill(skill: CodexSkillInfo): void {
    setSelectedSkills((current) => current.some((item) => item.id === skill.id) ? current : [...current, { id: skill.id, name: skill.name, description: skill.description }]);
    setInput((current) => current.replace(/\/$/, '').trimStart());
    setCommandMenu(undefined);
  }

  function selectFile(file: ProjectFileInfo): void {
    setSelectedFiles((current) => current.some((item) => item.path === file.path) ? current : [...current, file]);
    setInput((current) => current.replace(/@$/, '').trimStart());
    setCommandMenu(undefined);
  }

  function removeSkill(id: string): void {
    setSelectedSkills((current) => current.filter((skill) => skill.id !== id));
  }

  function removeFile(pathValue: string): void {
    setSelectedFiles((current) => current.filter((file) => file.path !== pathValue));
  }

  async function addFilesFromPicker(): Promise<void> {
    const result = await window.codexDesktop.selectFiles();
    if (result.canceled) return;
    setAttachments((current) => [
      ...current,
      ...result.files.map((file) => ({
        id: `${Date.now()}-${file.path}`,
        name: file.name,
        path: file.path,
        kind: file.kind
      }))
    ]);
  }

  async function refreshSkills(): Promise<void> {
    setSkillsLoading(true);
    try {
      setAvailableSkills(await window.codexDesktop.listSkills());
    } finally {
      setSkillsLoading(false);
    }
  }

  async function openSkillDetail(skillId: string): Promise<void> {
    const detail = await window.codexDesktop.getSkillDetail(skillId);
    if (detail) setSelectedSkillDetail(detail);
  }

  async function setSkillEnabled(skillId: string, enabled: boolean): Promise<void> {
    const skills = await window.codexDesktop.setSkillEnabled(skillId, enabled);
    setAvailableSkills(skills);
    const detail = await window.codexDesktop.getSkillDetail(skillId);
    setSelectedSkillDetail(detail);
  }

  async function uninstallSelectedSkill(skillId: string): Promise<void> {
    const skills = await window.codexDesktop.uninstallSkill(skillId);
    setAvailableSkills(skills);
    setSelectedSkillDetail(undefined);
  }

  function startSkillCreatorThread(): void {
    const creator = availableSkills.find((skill) => skill.id === 'skill-creator') ?? {
      id: 'skill-creator',
      name: 'Skill Creator',
      description: 'Guide for creating effective skills.',
      source: ''
    };
    startNewThread();
    setSelectedSkills([{ id: creator.id, name: creator.name, description: creator.description }]);
    setInput('帮我创建一个新的 Codex skill。请先询问我这个 skill 的用途、触发场景和工作流程。');
  }

  function toggleProjectSelector(button: HTMLButtonElement): void {
    if (projectSelectorOpen) {
      setProjectSelectorOpen(false);
      setProjectSelectorPosition(undefined);
      return;
    }
    const rect = button.getBoundingClientRect();
    const popoverWidth = 340;
    setProjectSelectorPosition({
      top: rect.bottom + 3,
      left: Math.max(10, Math.min(rect.left + rect.width / 2 - popoverWidth / 2, window.innerWidth - popoverWidth - 10))
    });
    setProjectSelectorOpen(true);
  }

  function toggleProjectMenu(project: ProjectEntry, button: HTMLButtonElement): void {
    if (openProjectMenuId === project.id) {
      setOpenProjectMenuId(undefined);
      setProjectMenuPosition(undefined);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 258;
    const menuHeight = 142;
    setOpenProjectMenuId(project.id);
    setProjectMenuPosition({
      top: Math.min(rect.bottom + 7, window.innerHeight - menuHeight - 10),
      left: Math.max(10, Math.min(rect.right - menuWidth + 18, window.innerWidth - menuWidth - 10))
    });
  }

  async function switchBranch(branch: string): Promise<void> {
    if (!activeProject || activeStatus === 'running') return;
    const project = activeProject;
    setBranchMenuOpen(false);
    const next = await window.codexDesktop.switchGitBranch({ cwd: project.path, branch });
    setBranchInfoByProject((current) => ({ ...current, [project.id]: next }));
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="traffic-spacer" aria-hidden="true" />
        <div className="nav-block top-actions">
          <button className={`ghost-button ${activeView === 'chat' ? 'active' : ''}`} onClick={() => startNewThread()}><NewThreadIcon className="nav-icon" /> New thread</button>
          <button className="ghost-button"><AutomationsIcon className="nav-icon" /> Automations</button>
          <button className={`ghost-button ${activeView === 'skills' ? 'active' : ''}`} onClick={() => setActiveView('skills')}><SkillsNavIcon className="nav-icon" /> Skills</button>
        </div>

        <section className="threads-section">
          <div className="section-title">
            <span>Threads</span>
            <span className="section-tools">
              <button className="section-tool-button" type="button" onClick={addProjectFromPicker} title="Add project"><FolderPlusIcon className="section-tool-icon" /></button>
              <span className="section-tool-icon">≡</span>
            </span>
          </div>
          <div className="threads-scroll">
            {projectState.projects.map((project) => {
              const histories = historiesByProject[project.id] || [];
              const expanded = expandedProjectIds.has(project.id);
              return (
                <div className="project-group" key={project.id}>
                  <div className={`project-pill ${project.id === activeProject?.id ? 'active' : ''}`} onClick={() => toggleProject(project)}>
                    <span className={expanded ? 'disclosure open' : 'disclosure'} aria-hidden="true" />
                    <FolderIcon className="folder-icon" />
                    <strong>{project.name}</strong>
                    <div className="project-actions">
                      <button className="project-menu-button" onClick={(event) => { event.stopPropagation(); toggleProjectMenu(project, event.currentTarget); }} title="Project options">•••</button>
                      <button className="project-edit-button" onClick={(event) => { event.stopPropagation(); void addProjectFromPicker(); }} title="Switch project path">✎</button>
                    </div>
                  </div>
                  {getProjectThreadRows({
                    projectId: project.id,
                    activeProjectId: activeProject?.id,
                    activeConversationId: session?.codexConversationId,
                    activeSessionId,
                    hasDraftSession: Boolean(session),
                    expandedProjectIds,
                    histories,
                    sessions: sessionsForProject(project)
                  }).map((row) => row.kind === 'new-thread' ? (
                    <button className={`thread-item new-thread-row ${row.active ? 'active-thread' : ''}`} key={`${project.id}:new`} onClick={() => startNewThread(project)}>
                      <span className="thread-title">New thread</span><span className="thread-time">{row.active ? 'now' : '+'}</span>
                    </button>
                  ) : row.kind === 'session' ? (
                    <button className={`thread-item ${row.active ? 'active-thread' : ''}`} key={row.session.id} onClick={() => openCachedSession(project, row.session)}>
                      <span className="thread-title">{row.title}</span><span className="thread-time">{row.running ? <ThreadSpinner /> : formatRelativeTime(row.session.updatedAt)}</span>
                    </button>
                  ) : (
                    <button className={`thread-item ${row.active ? 'active-thread' : ''}`} key={row.history.id} onClick={() => void openHistory(project, row.history)}>
                      <span className="thread-title">{row.history.title}</span><span className="thread-time">{row.running ? <ThreadSpinner /> : formatRelativeTime(row.history.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <button className="add-project" onClick={addProjectFromPicker}><FolderPlusIcon className="sidebar-action-icon" /> Add project</button>
        <button className="settings"><SettingsIcon className="sidebar-action-icon" /> Settings</button>
      </aside>

      {openProjectMenu && projectMenuPosition ? (
        <div className="project-menu project-menu-floating" ref={projectMenuRef} style={{ top: projectMenuPosition.top, left: projectMenuPosition.left }} onClick={(event) => event.stopPropagation()}>
          <button onClick={() => selectProject(openProjectMenu)}>↗ Create permanent worktree</button>
          <button onClick={() => { setOpenProjectMenuId(undefined); setProjectMenuPosition(undefined); }}>✎ Edit name</button>
          <button className="danger" onClick={() => removeProjectById(openProjectMenu.id)}>× Remove</button>
        </div>
      ) : null}

      {bootstrapStatus && !bootstrapStatus.installed && bootstrapHelpOpen ? (
        <BootstrapHelpModal status={bootstrapStatus} onClose={() => setBootstrapHelpOpen(false)} onRestart={() => window.codexDesktop.restartApp()} />
      ) : null}

      {projectOnboardingOpen ? (
        <ProjectOnboardingModal
          candidates={historyProjectCandidates}
          selectedProjectIds={selectedOnboardingProjectIds}
          canContinue={canContinueProjectOnboarding(selectedOnboardingProjectIds.size)}
          platform={bootstrapStatus?.platform}
          onAddProject={addProjectFromPicker}
          onContinue={addProjectsFromHistoryCandidates}
          onToggleProject={toggleOnboardingProject}
          onToggleAll={toggleAllOnboardingProjects}
          onClose={() => {
            setProjectOnboardingDismissed(true);
            setProjectOnboardingOpen(false);
          }}
        />
      ) : null}

      {projectSelectorOpen ? (
        <ProjectSelectorPopover
          activeProjectId={activeProject?.id}
          position={projectSelectorPosition}
          projects={projectState.projects}
          onSelect={selectProject}
          onClose={() => { setProjectSelectorOpen(false); setProjectSelectorPosition(undefined); }}
          onAddProject={addProjectFromPicker}
        />
      ) : null}

      <section className="workspace" ref={workspaceRef}>
        {activeView === 'skills' ? (
          <SkillsView
            skills={availableSkills}
            search={skillSearch}
            loading={skillsLoading}
            onSearch={setSkillSearch}
            onRefresh={() => { void refreshSkills(); }}
            onCreate={startSkillCreatorThread}
            onLearnMore={() => { void window.codexDesktop.openExternalTarget({ target: 'https://developers.openai.com/codex/skills' }); }}
            onOpen={(skillId) => { void openSkillDetail(skillId); }}
            onToggle={(skillId, enabled) => { void setSkillEnabled(skillId, enabled); }}
          />
        ) : (
        <>
        <header className="topbar">
          <div className="thread-heading"><strong>{currentTitle}</strong><span>{activeProject?.name || 'No project'}</span><span>•••</span></div>
        </header>

        <div className="content" ref={transcriptRef}>
          {!session || session.messages.length === 0 ? (
            <Welcome
              projectName={activeProject?.name || 'No project'}
              open={projectSelectorOpen}
              onToggle={toggleProjectSelector}
            />
          ) : <Transcript messages={session.messages} isRunning={activeStatus === 'running'} />}
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        {!session ? (
          <section className="suggestions" aria-label="Quick prompts">
            <button onClick={() => setInput('Build a classic Snake game in this repo.')}>🎮<span>Build a classic Snake game in this repo.</span></button>
          </section>
        ) : null}

        <section className="composer-panel">
          {commandMenu ? <CommandMenu mode={commandMenu} skills={enabledSkills} files={availableFiles} onSelectSkill={selectSkill} onSelectFile={selectFile} /> : null}
          {selectedSkills.length > 0 || selectedFiles.length > 0 ? <ReferenceChips skills={selectedSkills} files={selectedFiles} onRemoveSkill={removeSkill} onRemoveFile={removeFile} /> : null}
          {attachments.length > 0 ? <ComposerAttachments attachments={attachments} onRemove={removeAttachment} /> : null}
          <textarea ref={composerTextareaRef} value={input} onChange={(event) => handleComposerChange(event.target.value)} onPaste={(event) => { void handleComposerPaste(event); }} onKeyDown={handleComposerKeyDown} placeholder={session ? 'Ask for follow-up changes' : 'Ask Codex anything, @ to add files, / for commands'} disabled={activeStatus === 'running'} />
          <div className="composer-footer">
            <div className="composer-tools">
              <button onClick={addFilesFromPicker}>＋</button>
              <InlineSelect
                id="model"
                className="model-inline-select"
                value={model}
                label={model.toUpperCase()}
                options={availableModels.map((option) => ({ value: option.slug, label: option.slug.toUpperCase() }))}
                open={inlineMenuOpen === 'model'}
                disabled={activeStatus === 'running'}
                menuRef={inlineMenuRef}
                onOpenChange={(open) => setInlineMenuOpen(open ? 'model' : undefined)}
                onChange={setModel}
              />
              <InlineSelect
                id="reasoning"
                value={reasoningEffort}
                label={reasoningOptionLabel(reasoningEffort)}
                options={supportedReasoningOptions.map((option) => ({ value: option, label: reasoningOptionLabel(option) }))}
                open={inlineMenuOpen === 'reasoning'}
                disabled={activeStatus === 'running'}
                menuRef={inlineMenuRef}
                onOpenChange={(open) => setInlineMenuOpen(open ? 'reasoning' : undefined)}
                onChange={(value) => setReasoningEffort(value as ReasoningEffort)}
              />
            </div>
            <div className="composer-actions">{activeStatus === 'running' ? <button className="send stop" onClick={stopSession} aria-label="Stop"><StopIcon /></button> : <button className="send" onClick={sendPrompt} disabled={!canSend}>↑</button>}</div>
          </div>
        </section>

        <footer className="footer-status">
          <div className="footer-left">
            <span><LocalComputerIcon className="footer-icon" /> Local</span>
            <InlineSelect
              id="permission"
              className="permission-inline-select"
              value={permissionMode}
              label={permissionOptions.find((option) => option.value === permissionMode)?.label ?? permissionMode}
              options={permissionOptions}
              open={inlineMenuOpen === 'permission'}
              disabled={activeStatus === 'running'}
              menuRef={inlineMenuRef}
              onOpenChange={(open) => setInlineMenuOpen(open ? 'permission' : undefined)}
              onChange={(value) => setPermissionMode(value as PermissionMode)}
            />
          </div>
          <div className="branch-control" ref={branchControlRef}>
            <button className="footer-branch" type="button" onClick={() => setBranchMenuOpen((open) => !open)} disabled={gitBranches.branches.length === 0}>
              <span className="footer-icon">⑂</span>
              <span>{gitBranches.current || 'No branch'}</span>
              <span className="select-chevron" aria-hidden="true" />
            </button>
            {branchMenuOpen ? <BranchMenu info={gitBranches} onSwitch={(branch) => { void switchBranch(branch); }} /> : null}
          </div>
        </footer>
        </>
        )}
      </section>
      {selectedSkillDetail ? (
        <SkillDetailModal
          skill={selectedSkillDetail}
          onClose={() => setSelectedSkillDetail(undefined)}
          onOpenFolder={() => { void window.codexDesktop.openSkillFolder(selectedSkillDetail.id); }}
          onToggle={(enabled) => { void setSkillEnabled(selectedSkillDetail.id, enabled); }}
          onUninstall={() => { void uninstallSelectedSkill(selectedSkillDetail.id); }}
          onTry={() => {
            setSelectedSkills((current) => current.some((item) => item.id === selectedSkillDetail.id) ? current : [...current, { id: selectedSkillDetail.id, name: selectedSkillDetail.name, description: selectedSkillDetail.description }]);
            setActiveView('chat');
            setSelectedSkillDetail(undefined);
          }}
        />
      ) : null}
    </main>
  );
}

function SkillsView({
  skills,
  search,
  loading,
  onSearch,
  onRefresh,
  onCreate,
  onLearnMore,
  onOpen,
  onToggle
}: {
  skills: CodexSkillInfo[];
  search: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
  onLearnMore: () => void;
  onOpen: (skillId: string) => void;
  onToggle: (skillId: string, enabled: boolean) => void;
}): React.ReactElement {
  const filtered = skills.filter((skill) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return `${skill.name} ${skill.description ?? ''} ${skill.id}`.toLowerCase().includes(query);
  });

  return (
    <section className="skills-page">
      <header className="skills-toolbar">
        <button type="button" onClick={onRefresh} disabled={loading}>↻ Refresh</button>
        <label className="skills-search">
          <span>⌕</span>
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search skills" />
        </label>
        <button className="new-skill-button" type="button" onClick={onCreate}>＋ New skill</button>
      </header>
      <div className="skills-heading">
        <h1>Skills</h1>
        <p>Give Codex superpowers. <button type="button" onClick={onLearnMore}>Learn more</button></p>
      </div>
      <h2 className="skills-section-title">Installed</h2>
      <div className="skills-grid">
        {filtered.map((skill) => (
          <article className={`skill-card ${skill.enabled === false ? 'disabled' : ''}`} key={skill.id} onClick={() => onOpen(skill.id)}>
            <SkillIcon skill={skill} />
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.description || 'No description'}</span>
            </div>
            <button className={`skill-toggle ${skill.enabled === false ? '' : 'on'}`} type="button" onClick={(event) => { event.stopPropagation(); onToggle(skill.id, skill.enabled === false); }} aria-label={`${skill.enabled === false ? 'Enable' : 'Disable'} ${skill.name}`}>
              <span />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ThreadSpinner(): React.ReactElement {
  return (
    <svg className="thread-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Running" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="38" strokeDashoffset="10" />
    </svg>
  );
}

function ProjectOnboardingModal({
  candidates,
  selectedProjectIds,
  canContinue,
  platform,
  onAddProject,
  onContinue,
  onToggleProject,
  onToggleAll,
  onClose
}: {
  candidates: CodexProjectCandidate[];
  selectedProjectIds: ReadonlySet<string>;
  canContinue: boolean;
  platform?: string;
  onAddProject: () => void;
  onContinue: () => void;
  onToggleProject: (projectId: string) => void;
  onToggleAll: () => void;
  onClose: () => void;
}): React.ReactElement {
  const allSelected = candidates.length > 0 && selectedProjectIds.size === candidates.length;
  const isWindows = platform === 'win32';
  return (
    <div className="project-onboarding-layer" role="dialog" aria-modal="true">
      <section className={`project-onboarding-modal ${isWindows ? 'windows' : 'mac'}`}>
        <ProjectWindowControls platform={platform} onClose={onClose} onMinimize={onClose} />
        <div className="project-onboarding-brand">Codex</div>
        <div className="project-onboarding-copy">
          <h2>Select a project</h2>
          <p>Codex will be able to edit files and run commands in selected folders.</p>
        </div>
        {candidates.length > 0 ? (
          <div className="project-candidate-list">
            <button className="project-candidate-row select-all" type="button" onClick={onToggleAll}>
              <span className={allSelected ? 'candidate-check checked' : 'candidate-check'}>{allSelected ? '✓' : ''}</span>
              <strong>Select all</strong>
            </button>
            {candidates.slice(0, 8).map((candidate) => {
              const selected = selectedProjectIds.has(candidate.id);
              return (
                <button className="project-candidate-row" type="button" key={candidate.id} onClick={() => onToggleProject(candidate.id)}>
                  <span className={selected ? 'candidate-check checked' : 'candidate-check'}>{selected ? '✓' : ''}</span>
                  <span className="candidate-copy">
                    <strong>{candidate.name}</strong>
                    <small>{candidate.path}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <button className="project-onboarding-empty" type="button" onClick={onAddProject}>
            <FolderPlusIcon className="project-onboarding-icon" />
            <strong>No projects yet</strong>
            <span>Add a local project folder to start a new Codex conversation.</span>
          </button>
        )}
        <div className="project-onboarding-actions">
          <button type="button" onClick={onAddProject}>Add project</button>
          <button className="primary" type="button" onClick={onContinue} disabled={!canContinue}>Continue</button>
        </div>
        <button className="project-onboarding-skip" type="button" onClick={onClose}>Skip</button>
      </section>
    </div>
  );
}

function ProjectWindowControls({ platform, onClose, onMinimize }: { platform?: string; onClose: () => void; onMinimize: () => void }): React.ReactElement {
  const isWindows = platform === 'win32' || (!platform && /Windows/i.test(navigator.userAgent));
  return (
    <div className={`project-window-controls ${isWindows ? 'windows' : 'mac'}`}>
      {isWindows ? (
        <>
          <button type="button" onClick={onMinimize} aria-label="Minimize">—</button>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </>
      ) : (
        <>
          <button className="close" type="button" onClick={onClose} aria-label="Close" />
          <button className="minimize" type="button" onClick={onMinimize} aria-label="Minimize" />
        </>
      )}
    </div>
  );
}

function InlineSelect({
  id,
  className = '',
  value,
  label,
  options,
  open,
  disabled,
  menuRef,
  onOpenChange,
  onChange
}: {
  id: string;
  className?: string;
  value: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  open: boolean;
  disabled: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <div className={`inline-select ${className} ${open ? 'open' : ''}`} ref={open ? menuRef : undefined}>
      <button type="button" onClick={() => onOpenChange(!open)} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={id}>
        <span>{label}</span>
        <span className="select-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="inline-select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value ? 'selected' : ''}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                onOpenChange(false);
              }}
            >
              <span>{option.value === value ? '✓' : ''}</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BootstrapHelpModal({ status, onClose, onRestart }: { status: CodexBootstrapStatus; onClose: () => void; onRestart: () => void }): React.ReactElement {
  const missing = status.missing.length ? status.missing : ['Codex CLI'];
  const isWindows = status.platform === 'win32';
  return (
    <div className="skill-modal-layer" onMouseDown={onClose}>
      <section className="skill-modal bootstrap-help-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onClose}>×</button>
        <div className="skill-modal-header bootstrap-help-header">
          <div>
            <span className="bootstrap-help-icon">⌁</span>
            <h2>Codex CLI setup required</h2>
          </div>
        </div>
        <div className="skill-modal-body bootstrap-help-body">
          <p>Codex Desktop uses your local Codex CLI. The app could not run this command from its runtime environment:</p>
          <div className="bootstrap-missing-list">
            {missing.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="bootstrap-help-section">
            <h3>Install or verify</h3>
            <ol>
              <li>{isWindows ? 'Install Codex CLI from PowerShell, then reopen Codex Desktop.' : 'Install Codex CLI from Terminal, then reopen Codex Desktop.'}</li>
              <li>Confirm it works in a terminal with <code>codex --version</code>.</li>
              <li>If Terminal works but this app still shows this prompt, restart Codex Desktop so it can reload your shell PATH.</li>
            </ol>
          </div>
          <div className="bootstrap-help-section">
            <h3>Commands</h3>
            <pre>{isWindows ? 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"\ncodex --version' : 'curl -fsSL https://chatgpt.com/codex/install.sh | sh\ncodex --version'}</pre>
          </div>
          <p className="bootstrap-help-note">Git is not required for this startup check. The app only verifies that <code>codex --version</code> can run.</p>
        </div>
        <footer className="skill-modal-actions bootstrap-help-actions">
          <button type="button" onClick={onClose}>Later</button>
          <span />
          <button className="try-skill" type="button" onClick={onRestart}>Restart app</button>
        </footer>
      </section>
    </div>
  );
}

function SkillDetailModal({
  skill,
  onClose,
  onOpenFolder,
  onToggle,
  onUninstall,
  onTry
}: {
  skill: CodexSkillDetail;
  onClose: () => void;
  onOpenFolder: () => void;
  onToggle: (enabled: boolean) => void;
  onUninstall: () => void;
  onTry: () => void;
}): React.ReactElement {
  const body = stripSkillFrontmatter(skill.content);
  const example = skill.description || `Use ${skill.name} for the current task.`;
  return (
    <div className="skill-modal-layer" onMouseDown={onClose}>
      <section className="skill-modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="skill-modal-close" type="button" onClick={onClose}>×</button>
        <div className="skill-modal-header">
          <SkillIcon skill={skill} large />
          <button type="button" onClick={onOpenFolder}>Open folder ↗</button>
        </div>
        <div className="skill-modal-body">
          <h2>{skill.name}</h2>
          <p>{skill.description || 'No description'}</p>
          <div className="skill-example">
            <div>
              <span>Example prompt</span>
              <button type="button" onClick={() => { void copyText(example); }}>⧉</button>
            </div>
            <pre>{example}</pre>
          </div>
          <div className="skill-detail-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </div>
        <footer className="skill-modal-actions">
          <button className="danger" type="button" onClick={onUninstall}>Uninstall</button>
          <button type="button" onClick={() => onToggle(!skill.enabled)}>{skill.enabled ? 'Disable' : 'Enable'}</button>
          <span />
          <button className="try-skill" type="button" onClick={onTry}>✎ Try</button>
        </footer>
      </section>
    </div>
  );
}

function SkillIcon({ skill, large = false }: { skill: Pick<CodexSkillInfo, 'id' | 'name'>; large?: boolean }): React.ReactElement {
  const key = `${skill.id} ${skill.name}`.toLowerCase();
  let symbol = '▣';
  if (key.includes('pdf')) symbol = 'PDF';
  else if (key.includes('image')) symbol = '◒';
  else if (key.includes('review')) symbol = '☃';
  else if (key.includes('plugin')) symbol = '✎';
  return <span className={`skill-icon ${large ? 'large' : ''} ${symbol === 'PDF' ? 'pdf' : ''}`}>{symbol}</span>;
}

function stripSkillFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim() || 'No additional instructions.';
}

function Welcome({
  projectName,
  open,
  onToggle
}: {
  projectName: string;
  open: boolean;
  onToggle: (button: HTMLButtonElement) => void;
}): React.ReactElement {
  return (
    <section className="welcome">
      <div className="codex-mark">›_</div>
      <h1>Let’s build</h1>
      <button className={open ? 'project-select open' : 'project-select'} type="button" onClick={(event) => onToggle(event.currentTarget)}>
        <span>{projectName}</span>
        <span className="select-chevron" aria-hidden="true" />
      </button>
    </section>
  );
}

function ProjectSelectorPopover({
  activeProjectId,
  position,
  projects,
  onSelect,
  onClose,
  onAddProject
}: {
  activeProjectId?: string;
  position?: { top: number; left: number };
  projects: ProjectEntry[];
  onSelect: (project: ProjectEntry) => void;
  onClose: () => void;
  onAddProject: () => void;
}): React.ReactElement {
  const rows = projectSelectorRows(projects, activeProjectId);
  return (
    <div className="project-selector-layer" onPointerDown={onClose}>
      <div className="project-selector-popover" style={position} onPointerDown={(event) => event.stopPropagation()}>
        <div className="project-selector-title">Select your project</div>
        {rows.map((project) => (
          <button className={project.active ? 'project-selector-row active' : 'project-selector-row'} type="button" key={project.id} onClick={() => onSelect(project)}>
            <FolderIcon className="folder-icon" />
            <strong>{project.name}</strong>
            {project.active ? <span className="project-selector-check">✓</span> : null}
          </button>
        ))}
        <div className="project-selector-divider" />
        <button className="project-selector-row add" type="button" onClick={onAddProject}>
          <FolderPlusIcon className="project-selector-add-icon" />
          <strong>Add new project</strong>
        </button>
      </div>
    </div>
  );
}

function NewThreadIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 4H5.5A2.5 2.5 0 0 0 3 6.5v12A2.5 2.5 0 0 0 5.5 21h12A2.5 2.5 0 0 0 20 18.5V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AutomationsIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkillsNavIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="7" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function StopIcon(): React.ReactElement {
  return (
    <svg className="stop-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

function LocalComputerIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M6 19H18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7.5C4 6.67 4.67 6 5.5 6H9.2L10.8 8H18.5C19.33 8 20 8.67 20 9.5V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 10H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FolderPlusIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 6.5C3 5.67 3.67 5 4.5 5H9L11 7H19.5C20.33 7 21 7.67 21 8.5V11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 8.5V17.5C3 18.33 3.67 19 4.5 19H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 14V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 17H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.4 1.08V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.4H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6A1.65 1.65 0 0 0 10.4 2.92V3a2 2 0 1 1 4 0v-.08A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.33.34.64.6 1 .3.37.69.6 1.08.6H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function MarkdownCodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const code = nodeText(children).replace(/\n$/, '');
  const language = codeBlockLanguage(children);

  async function handleCopy(): Promise<void> {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="markdown-code-block">
      {language ? <div className="code-language-label">{language}</div> : null}
      <button className="copy-code-button" type="button" onClick={handleCopy} aria-label="Copy code" title="Copy code">
        {copied ? '✓' : <CopyIcon />}
      </button>
      <pre {...props}><code>{tokenizeCode(code).map((token, index) => <span className={`syntax-token ${token.kind}`} key={`${index}-${token.kind}`}>{token.text}</span>)}</code></pre>
    </div>
  );
}

function codeBlockLanguage(node: React.ReactNode): string | undefined {
  const first = Array.isArray(node) ? node[0] : node;
  if (!React.isValidElement<{ className?: string }>(first)) return undefined;
  const match = /language-([^\s]+)/.exec(first.props.className ?? '');
  return match?.[1];
}

function CopyIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 2.5A1.5 1.5 0 0 1 6.5 1h6A1.5 1.5 0 0 1 14 2.5v6a1.5 1.5 0 0 1-1.5 1.5H11V8.5h1.5v-6h-6V4H5V2.5Z" />
      <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h6A1.5 1.5 0 0 1 11 6.5v7A1.5 1.5 0 0 1 9.5 15h-6A1.5 1.5 0 0 1 2 13.5v-7Zm1.5 0v7h6v-7h-6Z" />
    </svg>
  );
}

const markdownComponents: Components = {
  pre: MarkdownCodeBlock,
  a: MarkdownLink
};

function MarkdownLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>): React.ReactElement {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (!href) return;
    event.preventDefault();
    void window.codexDesktop.openExternalTarget({ target: href });
  }

  return <a {...props} href={href} onClick={handleClick}>{children}</a>;
}

function ActivityMessage({ text }: { text: string }): React.ReactElement {
  return (
    <details className="activity-block" open>
      <summary>activity</summary>
      <div className="activity-body">
        {splitActivitySegments(text).map((segment, index) => segment.type === 'diff' ? (
          <pre className="activity-diff" key={`${segment.type}-${index}`}>
            {segment.text.split('\n').map((line, lineIndex) => (
              <span className={diffLineClass(line)} key={`${lineIndex}-${line}`}>{line || ' '}</span>
            ))}
          </pre>
        ) : isMarkdownActivityText(segment.text) ? (
          <div className="activity-markdown" key={`${segment.type}-${index}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{segment.text}</ReactMarkdown>
          </div>
        ) : (
          <pre className="activity-text" key={`${segment.type}-${index}`}>{segment.text}</pre>
        ))}
      </div>
    </details>
  );
}

function UserMessage({ text }: { text: string }): React.ReactElement {
  return (
    <>
      <div className="user-message-body">
        {splitUserMessageParts(normalizeTerminalText(text)).map((part, index) => part.type === 'image' ? (
          <LocalImagePreview imagePath={part.path} name={part.name} key={`${part.path}-${index}`} />
        ) : part.text.trim().length > 0 ? (
          <pre key={`text-${index}`}>{part.text}</pre>
        ) : null)}
      </div>
    </>
  );
}

function CommandMenu({ mode, skills, files, onSelectSkill, onSelectFile }: {
  mode: 'skills' | 'files';
  skills: CodexSkillInfo[];
  files: ProjectFileInfo[];
  onSelectSkill: (skill: CodexSkillInfo) => void;
  onSelectFile: (file: ProjectFileInfo) => void;
}): React.ReactElement {
  const skillItems = skills.slice(0, 12);
  const fileItems = files.slice(0, 18);
  return (
    <div className="command-menu">
      <div className="command-search">Search</div>
      {mode === 'skills' ? (
        <>
          <div className="command-section">Skills</div>
          {skillItems.map((skill) => (
            <button className="command-item" type="button" key={skill.id} onClick={() => onSelectSkill(skill)}>
              <span className="command-icon">◈</span><strong>{skill.name}</strong><span>{skill.description}</span><em>Personal</em>
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="command-section">Files</div>
          {fileItems.map((file) => (
            <button className="command-item" type="button" key={file.path} onClick={() => onSelectFile(file)}>
              <span className="command-icon">▤</span><strong>{file.relativePath}</strong><span>{file.path}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function ReferenceChips({ skills, files, onRemoveSkill, onRemoveFile }: {
  skills: ComposerSkillReference[];
  files: ComposerFileReference[];
  onRemoveSkill: (id: string) => void;
  onRemoveFile: (path: string) => void;
}): React.ReactElement {
  return (
    <div className="reference-chips">
      {skills.map((skill) => <button className="reference-chip skill" type="button" key={skill.id} onClick={() => onRemoveSkill(skill.id)}>◈ {skill.name} <span>×</span></button>)}
      {files.map((file) => <button className="reference-chip file" type="button" key={file.path} onClick={() => onRemoveFile(file.path)}>@ {file.relativePath} <span>×</span></button>)}
    </div>
  );
}

function BranchMenu({ info, onSwitch }: { info: GitBranchInfo; onSwitch: (branch: string) => void }): React.ReactElement {
  const status = info.status;
  const [query, setQuery] = useState('');
  const branches = filterBranches(info.branches, query);
  return (
    <div className="branch-menu">
      <label className="branch-search">
        <span>⌕</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches" autoFocus />
      </label>
      <div className="branch-title">Branches</div>
      {branches.map((branch) => (
        <button className="branch-item" type="button" key={branch.name} onClick={() => onSwitch(branch.name)}>
          <span>⑂</span>
          <span className="branch-copy">
            <strong>{branch.name}</strong>
            {branch.current && status ? (
              <small>
                Uncommitted: {status.uncommittedFiles} files <b className="branch-plus">+{status.added}</b> <b className="branch-minus">-{status.removed}</b>
              </small>
            ) : null}
          </span>
          {branch.current ? <em>✓</em> : null}
        </button>
      ))}
      {branches.length === 0 ? <div className="branch-empty">No matching branches</div> : null}
      <div className="branch-divider" />
      <button className="branch-create" type="button" disabled>＋ Create and checkout new branch...</button>
    </div>
  );
}

function ComposerAttachments({ attachments, onRemove }: { attachments: ComposerAttachment[]; onRemove: (id: string) => void }): React.ReactElement {
  return (
    <div className="composer-attachments" aria-label="File attachments">
      {attachments.map((attachment) => (
        <div className="composer-attachment" key={attachment.id}>
          {(attachment.kind ?? 'image') === 'image' ? <LocalImagePreview imagePath={attachment.path} name={attachment.name} compact /> : <span className="file-attachment-icon" aria-hidden="true" />}
          <span className="composer-attachment-name" title={attachment.name}>{attachment.name}</span>
          <button type="button" onClick={() => onRemove(attachment.id)} aria-label={`Remove ${attachment.name}`}>×</button>
        </div>
      ))}
    </div>
  );
}

function LocalImagePreview({ imagePath, name, compact = false }: { imagePath: string; name: string; compact?: boolean }): React.ReactElement {
  const [source, setSource] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSource(undefined);
    setFailed(false);
    void window.codexDesktop.readLocalImage({ path: imagePath }).then((result) => {
      if (cancelled) return;
      if (result.dataUrl) {
        setSource(result.dataUrl);
        return;
      }
      setFailed(true);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => { cancelled = true; };
  }, [imagePath]);

  return (
    <figure className={compact ? 'composer-image-preview' : 'user-image-preview'}>
      {source ? <button className="image-preview-button" type="button" onClick={() => setOpen(true)}><img src={source} alt={name} /></button> : <div className="image-preview-fallback">{failed ? 'Image expired' : 'Loading image...'}</div>}
      {compact ? null : <figcaption>{name}</figcaption>}
      {open && source ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <button className="image-lightbox-close" type="button" onClick={() => setOpen(false)} aria-label="Close image preview">×</button>
          <img src={source} alt={name} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </figure>
  );
}

const Transcript = React.memo(function Transcript({ messages, isRunning }: { messages: SessionMessage[]; isRunning: boolean }): React.ReactElement {
  const visibleMessages = useMemo(() => visibleTranscriptMessages(messages), [messages]);
  return (
    <section className="transcript">
      {visibleMessages.map((message) => (
        <TranscriptMessage message={message} key={message.id} />
      ))}
      {isRunning ? <div className="thinking">Thinking</div> : null}
    </section>
  );
});

const TranscriptMessage = React.memo(function TranscriptMessage({ message }: { message: SessionMessage }): React.ReactElement {
  return (
    <article className={`message ${message.role}`}>
      {message.role === 'system' ? <ActivityMessage text={message.text} /> : null}
      {message.role === 'user' ? <UserMessage text={message.text} /> : null}
      {message.role === 'codex' ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{normalizeTerminalText(message.text)}</ReactMarkdown> : null}
    </article>
  );
});

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
