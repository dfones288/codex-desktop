# Codex Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop UI that controls a locally installed `codex` CLI through a PTY.

**Architecture:** Electron main process manages privileged local operations and Codex exec JSONL. React renderer provides Codex-style project/session UI. Shared TypeScript types keep IPC contracts explicit.

**Tech Stack:** Electron, React, TypeScript, Vite, Codex exec JSONL, Vitest.

---

## File Map
- `package.json`: scripts and dependencies.
- `tsconfig*.json`: TypeScript config for app, main, tests.
- `vite.config.ts`: renderer dev/build config.
- `src/shared/types.ts`: common session/message/IPC types.
- `src/main/codexCommand.ts`: Codex executable/path validation helpers.
- `src/main/sessionStore.ts`: in-memory message/session state.
- `src/main/codexExecManager.ts`: Codex exec/resume integration and lifecycle.
- `src/main/ipc.ts`: Electron IPC handlers.
- `src/main/main.ts`: Electron app bootstrap.
- `src/preload/index.ts`: secure renderer API bridge.
- `src/renderer/*`: React UI and styles.
- `tests/*`: unit tests for pure main-process logic.

## Tasks
- [ ] Scaffold package, TypeScript, Vite, Electron entry files.
- [ ] Add shared types and tested command/session logic.
- [ ] Implement PTY manager and IPC bridge.
- [ ] Implement React UI matching the screenshot direction.
- [ ] Add README and run local verification.
