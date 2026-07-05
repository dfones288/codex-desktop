# Codex Desktop

An unofficial desktop client for the local Codex CLI. Codex Desktop turns `codex exec` into a visual, project-aware workspace with threads, skills, attachments, model controls, activity logs, and native desktop packaging.

Codex Desktop does not replace the Codex CLI. It wraps your already installed local `codex` command and keeps execution on your machine through the Electron main process.

## Why This Exists

The Codex CLI is powerful, but long-running coding sessions, multiple projects, screenshots, command activity, diffs, and historical threads are easier to manage in a dedicated desktop UI.

Codex Desktop is built for developers who want:

- A visual chat workspace for real local Codex runs.
- Project-based thread history instead of terminal scrollback.
- Concurrent sessions that can keep running while you switch threads.
- Markdown, code blocks, diffs, images, and activity output rendered cleanly.
- A packaged macOS / Windows app that still uses the local CLI and local filesystem.

## Features

### Real Codex CLI Execution

- Runs real local `codex exec --json` commands.
- Uses `codex exec resume` to continue Codex CLI conversations with session continuity.
- Defaults to `gpt-5.5`.
- Reads available models from `codex debug models`.
- Reads each model's supported reasoning levels and updates the reasoning picker accordingly.
- Supports `workspace-write` and `full access` permission modes.
- Displays command activity, patch output, web/search activity, stderr, and Codex error events.

### Project And Thread Workspace

- Add and remove local project folders with native file dialogs.
- Reads existing Codex history from `~/.codex/sessions`.
- Suggests previously used projects on first launch.
- Shows project-specific thread lists.
- Supports expanding multiple projects in the sidebar.
- Supports multiple running threads at the same time.
- Switching threads does not stop running Codex processes.
- Running threads show a spinner in the sidebar.

### Rich Transcript Rendering

- GitHub-flavored Markdown rendering.
- Syntax-highlighted code blocks.
- Always-visible copy button on code blocks.
- Diff blocks with colored added and removed lines.
- Activity sections for terminal commands, patch application, command output, tool output, and errors.
- Image previews for local screenshots and pasted images.
- Click image previews to view the larger image.
- External links open in the system browser.
- Local file links reveal files in the OS file manager.

### Composer

- Paste images directly into the input box.
- Attach multiple files.
- Add current project files with `@`.
- Add local Codex skills with `/`.
- Selected skills and file references are included in the prompt sent to Codex.
- Multi-line input auto-resizes up to a bounded height.

### Skills UI

- Reads installed skills from:
  - `~/.codex/skills`
  - `~/.codex/superpowers/skills`
- Search installed skills.
- Refresh skill list.
- View skill details.
- Enable / disable skills.
- Uninstall skills.
- Open a skill folder in the file manager.
- Start a new thread for creating a skill.

### Git Helpers

- Shows current branch for the active project.
- Lists local branches.
- Searches branches.
- Switches branches through the UI.
- Shows uncommitted file count and diff stats for the current branch when available.
- If Git is not installed, Codex Desktop still works; Git is only needed for branch features.

### Desktop Packaging

- Electron + React + TypeScript.
- macOS universal DMG / ZIP.
- Windows NSIS installers for x64 and arm64.
- Windows npm global Codex shims are supported through `cmd.exe /c call codex`.
- Packaged GUI apps use an expanded PATH so they can find common local Codex install locations.

## How It Works

Codex Desktop has three layers:

```text
Renderer UI          Preload bridge           Electron main process
React + CSS    ->    window.codexDesktop ->   local filesystem + child processes
```

### 1. Renderer

The renderer is a React app. It owns the UI state for:

- active project
- expanded projects
- active thread
- running sessions
- model and reasoning settings
- composer attachments
- skills and file references
- rendered transcript

The renderer does not access Node APIs directly. It only calls the typed preload bridge exposed as `window.codexDesktop`.

### 2. Preload Bridge

The preload layer exposes a narrow IPC API:

- start / resume / stop Codex sessions
- send user input
- list models
- list histories
- list skills
- select directories and files
- save / read pasted images
- open external links and file locations
- list and switch Git branches

This keeps local system access out of the browser-like renderer environment.

### 3. Main Process

The Electron main process owns all local capabilities:

- validates project directories
- locates the local Codex CLI
- spawns Codex child processes
- parses JSONL output
- tracks session state
- reads Codex history files
- reads skills from disk
- opens native dialogs
- opens URLs and file locations with the OS

For a new message, Codex Desktop builds a command similar to:

```bash
codex exec --json --color never --skip-git-repo-check \
  -m gpt-5.5 \
  -c 'model_reasoning_effort="high"' \
  -s workspace-write \
  -C /path/to/project \
  "your prompt"
```

When the Codex CLI returns a conversation id, Codex Desktop stores it with the desktop session. Follow-up prompts use:

```bash
codex exec resume --json --skip-git-repo-check \
  -m gpt-5.5 \
  -c 'model_reasoning_effort="high"' \
  <codex-conversation-id> \
  "your follow-up prompt"
```

The JSONL stream is parsed into:

- assistant messages
- system activity
- command output
- patch / diff output
- web search activity
- stderr and process errors
- Codex error events, including timeouts and failed tool calls

## Requirements

- Node.js 20+
- npm
- A working local Codex CLI

Install Codex CLI first:

```bash
npm install -g @openai/codex
codex --version
```

On startup, Codex Desktop only checks whether `codex --version` can run. It does not separately check Git or Node.js. If your Codex CLI installation depends on Node.js, Node.js still needs to be available to the `codex` command itself. Git is only needed for branch features.

## Getting Started

```bash
git clone <your-repo-url>
cd codex-desktop
npm install
npm run dev
```

The app will open an Electron window. Add a project folder, select a model and reasoning level, then send a prompt.

## Development Commands

```bash
# Start Vite + Electron in development mode
npm run dev

# Type-check Electron, renderer, and tests
npm run typecheck

# Run the test suite
npm test

# Build production renderer/main/preload output
npm run build

# Start from built output
npm start
```

## Packaging

Codex Desktop uses `electron-builder`.

```bash
# Package for the current host platform
npm run package

# Build macOS universal DMG/ZIP
npm run package:mac

# Build Windows x64/arm64 NSIS installers
npm run package:win
```

Artifacts are written to `release/`.

### macOS Signing And Notarization

For public macOS releases, sign and notarize the app with an Apple Developer ID certificate.

```bash
export CSC_LINK="/secure/path/developer-id-application.p12"
export CSC_KEY_PASSWORD="certificate-password"
export APPLE_API_KEY="/secure/path/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="issuer-uuid"
npm run package:mac
```

If signing variables are not set, local test packaging disables automatic certificate discovery to avoid accidentally using the wrong certificate.

### Windows Signing

For public Windows releases, provide a code signing certificate to reduce SmartScreen and publisher warnings.

```bash
export WIN_CSC_LINK="/secure/path/windows-code-signing.pfx"
export WIN_CSC_KEY_PASSWORD="certificate-password"
npm run package:win
```

## Project Structure

```text
src/
  main/        Electron main process: Codex process management, filesystem, IPC
  preload/     Safe bridge exposed to the renderer
  renderer/    React UI, transcript rendering, project/sidebar/composer state
  shared/      Shared TypeScript types
tests/         Vitest coverage for command building, history parsing, UI logic helpers
scripts/       Development and packaging helpers
```

Key files:

- `src/main/codexCommand.ts` builds platform-specific Codex CLI invocations.
- `src/main/codexExecManager.ts` owns running Codex processes and JSONL streaming.
- `src/main/codexEvents.ts` parses Codex JSONL events into visible transcript/activity text.
- `src/main/codexHistory.ts` restores local Codex history from `~/.codex/sessions`.
- `src/main/codexModels.ts` reads model metadata from `codex debug models`.
- `src/main/skillStore.ts` reads and manages local skills.
- `src/renderer/main.tsx` contains the main React desktop UI.

## Security Model

Codex Desktop intentionally keeps privileged operations in the Electron main process.

- The renderer cannot call Node APIs directly.
- Filesystem access goes through explicit IPC handlers.
- Codex commands are spawned by the main process.
- External links are opened through Electron `shell.openExternal`.
- Local file targets are revealed through the OS file manager.

The app can run Codex with full filesystem access when the user chooses `Full access`. Use that mode carefully.

## Current Status

This project is under active development. The current focus is making the local Codex CLI experience feel native on desktop while preserving real CLI behavior and local execution.

Known areas for future improvement:

- More polished release onboarding.
- Better diagnostics export for failed Codex runs.
- Optional screenshot assets and demo GIFs for the repository homepage.
- More robust cross-platform integration tests for packaged apps.

## Contributing

Issues and pull requests are welcome.

Recommended workflow:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Please keep changes focused and include tests for command parsing, history parsing, or renderer helper behavior when possible.

## License

Add a license before publishing the repository publicly. MIT is a common choice for developer tooling, but choose the license that matches your distribution goals.

## Disclaimer

Codex Desktop is an independent desktop wrapper around the local Codex CLI. It is not an official OpenAI product. You are responsible for your local Codex CLI installation, account configuration, model access, and any commands you authorize Codex to run.
