export interface CodeToken {
  text: string;
  kind: 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'function' | 'operator' | 'punctuation';
}

const keywordSet = new Set([
  'and', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'def', 'default', 'del', 'do', 'elif', 'else', 'except', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'interface', 'is', 'let', 'match', 'new', 'none', 'not', 'null', 'or', 'pass', 'raise', 'return', 'static', 'super', 'switch', 'throw', 'true', 'try', 'type', 'undefined', 'var', 'while', 'with', 'yield'
]);

const tokenPattern = /(#.*|\/\/.*|\/\*.*?\*\/|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*(?=\s*\()|\b[A-Za-z_]\w*\b|[+\-*\/%=<>!&|^~]+|[()[\]{}.,:;])/g;

export function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let cursor = 0;
  for (const match of code.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: code.slice(cursor, index), kind: 'plain' });
    const text = match[0];
    tokens.push({ text, kind: tokenKind(text) });
    cursor = index + text.length;
  }
  if (cursor < code.length) tokens.push({ text: code.slice(cursor), kind: 'plain' });
  return tokens;
}

function tokenKind(text: string): CodeToken['kind'] {
  if (text.startsWith('#') || text.startsWith('//') || text.startsWith('/*')) return 'comment';
  if (text.startsWith('"') || text.startsWith("'") || text.startsWith('`')) return 'string';
  if (/^\d/.test(text)) return 'number';
  if (keywordSet.has(text.toLowerCase())) return 'keyword';
  if (/^[A-Za-z_]\w*$/.test(text)) return 'function';
  if (/^[()[\]{}.,:;]$/.test(text)) return 'punctuation';
  return 'operator';
}
