type FrontmatterValue = string | number | boolean | null | string[];

export function renderMarkdownFrontmatter(fields: Record<string, FrontmatterValue | undefined>) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${JSON.stringify(item)}`);
        }
      }
      continue;
    }
    if (value === null) {
      lines.push(`${key}: null`);
      continue;
    }
    if (typeof value === 'string') {
      lines.push(`${key}: ${renderScalar(value)}`);
      continue;
    }
    lines.push(`${key}: ${String(value)}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

export function parseMarkdownFrontmatter(content: string): {
  attributes: Record<string, string | null>;
  lists: Record<string, string[]>;
  body: string;
} {
  if (!content.startsWith('---\n')) {
    return {
      attributes: {},
      lists: {},
      body: content,
    };
  }
  const lines = content.split('\n');
  const attributes: Record<string, string | null> = {};
  const lists: Record<string, string[]> = {};
  let index = 1;
  let activeListKey: string | null = null;
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line === '---') {
      index += 1;
      break;
    }
    if (activeListKey && line.trimStart().startsWith('- ')) {
      lists[activeListKey] ??= [];
      const activeList = lists[activeListKey];
      if (activeList) {
        activeList.push(coerceScalar(line.trim().replace(/^- /, '')));
      }
      continue;
    }
    activeListKey = null;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (!rawValue) {
      activeListKey = key;
      lists[key] ??= [];
      continue;
    }
    if (rawValue === '[]') {
      lists[key] = [];
      continue;
    }
    attributes[key] = rawValue === 'null' ? null : coerceScalar(rawValue);
  }
  return {
    attributes,
    lists,
    body: lines.slice(index).join('\n'),
  };
}

export function appendMarkdownBlock(content: string, body: string, heading?: string) {
  const nextBlock = heading
    ? `## ${heading}\n\n${body.trim()}`
    : body.trim();
  const base = content.trimEnd();
  if (!base) {
    return `${nextBlock}\n`;
  }
  return `${base}\n\n${nextBlock}\n`;
}

export function extractMarkdownHeading(content: string) {
  const body = stripMarkdownFrontmatter(content);
  const heading = body.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.replace(/^# /, '') : null;
}

export function stripMarkdownFrontmatter(content: string) {
  return parseMarkdownFrontmatter(content).body;
}

function coerceScalar(raw: string) {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}

function renderScalar(value: string) {
  return /^[A-Za-z0-9._:-]+$/.test(value)
    ? value
    : JSON.stringify(value);
}
