# Codex Desktop Design

## Goal
Build a desktop visual client for a locally installed `codex` CLI, using Electron + React + TypeScript + Codex exec JSONL.

## Scope
The first version provides a local desktop shell that can select a project directory, start a Codex CLI session, send prompts to the running process, and display streaming terminal output in a chat-like interface inspired by the provided screenshot.

## Architecture
- Electron main process owns local system access: project directory selection, CLI discovery, PTY lifecycle, and IPC.
- Preload exposes a narrow typed API to the renderer through `contextBridge`.
- React renderer owns UI state and presentation only. It never imports Node APIs directly.
- Shared TypeScript types define IPC payloads and session/message models.

## Components
- `CodexExecManager`: runs `codex exec --json` turns, stores the returned `thread_id`, resumes follow-up prompts with `codex exec resume`, streams output, and reports turn completion.
- `SessionStore`: keeps in-memory session metadata and messages for the current app run.
- Renderer app: sidebar, welcome state, prompt composer, terminal/chat transcript, session controls, and settings indicators.

## Data Flow
1. User selects or uses a project path.
2. Renderer calls `window.codexDesktop.startSession({ cwd })`.
3. Main process spawns `codex` in a PTY.
4. PTY output is pushed to renderer through IPC events.
5. User sends prompts; renderer calls `sendInput`, main process writes text plus newline to PTY.
6. Stop session terminates the PTY and updates renderer state.

## Error Handling
- Missing `codex` executable produces a renderer-visible error with setup guidance.
- Invalid project paths are rejected before spawn.
- PTY exit and spawn failures are surfaced as session events.
- Renderer disables send controls when no session is running.

## Testing
- Unit tests cover command resolution/session state logic without launching a real `codex` process.
- Type checking validates IPC contracts and renderer/main boundaries.
- Build verification validates Electron/Vite packaging inputs compile.
