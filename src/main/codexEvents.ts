type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function parseJsonLine(line: string): JsonObject | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return asObject(JSON.parse(trimmed));
  } catch {
    return undefined;
  }
}

export function extractConversationId(event: JsonObject): string | undefined {
  return (
    asString(event.conversation_id) ||
    asString(event.conversationId) ||
    asString(event.session_id) ||
    asString(event.sessionId) ||
    asString(event.thread_id) ||
    asString(event.threadId) ||
    asString(asObject(event.thread)?.id) ||
    asString(asObject(event.session)?.id)
  );
}

export function extractCodexEventText(event: JsonObject): string | undefined {
  if (event.type === 'error') {
    return undefined;
  }

  if (isProcessOnlyEvent(event)) {
    return undefined;
  }

  const direct = asString(event.message) || asString(event.text) || asString(event.delta) || asString(event.output);
  if (direct) {
    return direct;
  }

  const content = event.content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        const object = asObject(part);
        return object ? asString(object.text) : undefined;
      })
      .filter(Boolean)
      .join('');
    return text || undefined;
  }

  const item = asObject(event.item);
  if (item) {
    if (item.type === 'error') {
      return undefined;
    }
    return extractCodexEventText(item);
  }

  return undefined;
}

export function extractCodexErrorText(event: JsonObject): string | undefined {
  const message = rawErrorMessage(event);
  return message ? `Error\n${message.trimEnd()}\n` : undefined;
}

export function extractCodexProcessText(event: JsonObject): string | undefined {
  const payload = asObject(event.payload);
  const item = asObject(event.item);
  const source = item || payload || event;
  const type = asString(source.type) || asString(event.type);
  const name = asString(source.name) || asString(event.name);

  if (type === 'function_call_output' || type === 'custom_tool_call_output') {
    const output = asString(source.output);
    return output ? `Output\n${output.trimEnd()}\n` : undefined;
  }

  if (type === 'patch_apply_end') {
    return formatPatchApplyEnd(source);
  }

  if (type === 'custom_tool_call' && name === 'apply_patch') {
    const input = asString(source.input);
    return input ? `Applied patch\n\`\`\`diff\n${input.trimEnd()}\n\`\`\`\n` : 'Applied patch\n';
  }

  if ((type && /web[_-]?search/i.test(type)) || (name && /web[_-]?search/i.test(name))) {
    const query = asString(source.query) || asString(event.query) || asString(source.action) || 'web';
    return `Searched web for ${query}\n`;
  }

  if ((type && /(command|exec|shell|tool|function_call)/i.test(type)) || (name && /(command|exec|shell|tool)/i.test(name))) {
    const parsedArguments = parseArguments(source.arguments);
    const command =
      asString(source.command) ||
      asString(source.cmd) ||
      asString(parsedArguments?.cmd) ||
      asString(parsedArguments?.command) ||
      name ||
      asString(event.command) ||
      asString(event.cmd);
    if (command) {
      const cwd = asString(source.cwd) || asString(parsedArguments?.workdir) || asString(parsedArguments?.cwd);
      return `Ran ${command}\n${cwd ? `cwd ${cwd}\n` : ''}`;
    }
  }

  const toolName = asString(source.tool_name) || asString(source.toolName) || asString(event.tool_name) || asString(event.toolName);
  if (toolName) {
    return `Used ${toolName}\n`;
  }

  return undefined;
}

function rawErrorMessage(event: JsonObject): string | undefined {
  const payload = asObject(event.payload);
  const item = asObject(event.item);
  const response = asObject(event.response);
  const error = asObject(event.error);
  const responseError = asObject(response?.error);
  const source = item || payload || event;
  const sourceError = asObject(source.error);
  const type = asString(source.type) || asString(event.type);
  const status = asString(source.status) || asString(response?.status);

  if (type !== 'error' && status !== 'failed' && !error && !sourceError && !responseError) {
    return undefined;
  }

  return (
    asString(source.message) ||
    asString(source.error) ||
    asString(sourceError?.message) ||
    asString(sourceError?.details) ||
    asString(error?.message) ||
    asString(error?.details) ||
    asString(responseError?.message) ||
    asString(responseError?.details) ||
    asString(source.output) ||
    asString(event.message)
  );
}

function isProcessOnlyEvent(event: JsonObject): boolean {
  const payload = asObject(event.payload);
  const source = payload || event;
  const type = asString(source.type) || asString(event.type);
  return type === 'function_call' ||
    type === 'function_call_output' ||
    type === 'custom_tool_call' ||
    type === 'custom_tool_call_output' ||
    type === 'patch_apply_end';
}

function parseArguments(value: unknown): JsonObject | undefined {
  if (typeof value === 'string') {
    try {
      return asObject(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  return asObject(value);
}

function formatPatchApplyEnd(source: JsonObject): string | undefined {
  const changes = asObject(source.changes);
  const stdout = asString(source.stdout);
  const sections: string[] = [];

  if (changes) {
    for (const [filePath, rawChange] of Object.entries(changes)) {
      const change = asObject(rawChange);
      const diff = asString(change?.unified_diff);
      const stats = diff ? diffStats(diff) : { added: 0, removed: 0 };
      sections.push(`Edited ${displayPath(filePath)} (+${stats.added} -${stats.removed})`);
      if (diff) {
        sections.push(`\`\`\`diff\n${diff.trimEnd()}\n\`\`\``);
      }
    }
  }

  if (stdout) {
    sections.push(stdout.trimEnd());
  }

  return sections.length > 0 ? `${sections.join('\n')}\n` : undefined;
}

function diffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
    if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
  }
  return { added, removed };
}

function displayPath(filePath: string): string {
  for (const marker of ['/src/', '/tests/', '/docs/', '/scripts/']) {
    const index = filePath.indexOf(marker);
    if (index >= 0) return filePath.slice(index + 1);
  }
  return filePath.split('/').filter(Boolean).at(-1) || filePath;
}
