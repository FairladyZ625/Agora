import { readFileSync } from 'node:fs';

/**
 * Intentionally supports the small TOML subset emitted by Agora Nomos packs.
 * Unsupported syntax should fail explicitly instead of being parsed by accident.
 */
export function parseSimpleToml(content: string) {
  const root: Record<string, unknown> = {};
  const sections: Record<string, Record<string, unknown>> = {};
  let currentSection = '';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('[[')) {
      throw new Error(`Nomos pack profile uses unsupported TOML array table syntax: ${line}`);
    }
    const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1] ?? '';
      sections[currentSection] = sections[currentSection] ?? {};
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const valueContext = currentSection ? `${currentSection}.${key}` : key;
    assertSupportedTomlValue(rawValue, valueContext);
    const parsedValue = parseStructuredValue(rawValue, valueContext);
    if (currentSection) {
      const section = sections[currentSection] ?? {};
      section[key] = parsedValue;
      sections[currentSection] = section;
      continue;
    }
    root[key] = parsedValue;
  }

  return { root, sections };
}

export function parseStructuredFrontmatter(content: string) {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') {
    throw new Error('Project Nomos authoring spec must start with frontmatter');
  }
  const result: Record<string, unknown> = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '---') {
      return result;
    }
    if (!line.trim()) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!rawValue.length) {
      const consumed = consumeStructuredListBlock(lines, index + 1);
      result[key] = consumed.value;
      index = consumed.lastIndex;
      continue;
    }
    result[key] = parseStructuredValue(rawValue, key);
  }
  throw new Error('Project Nomos authoring spec frontmatter is not closed');
}

export function parseStructuredFrontmatterFile(path: string) {
  return parseStructuredFrontmatter(readFileSync(path, 'utf8'));
}

// We only emit basic quoted strings and string arrays today, so JSON escaping is
// a deliberate TOML subset simplification rather than an accidental shortcut.
export function tomlString(value: string) {
  return JSON.stringify(value);
}

export function tomlStringArray(values: readonly string[]) {
  return `[${values.map((value) => tomlString(value)).join(', ')}]`;
}

function assertSupportedTomlValue(rawValue: string, context: string) {
  if (rawValue.startsWith('{')) {
    throw new Error(`Nomos pack profile uses unsupported TOML inline table syntax for ${context}`);
  }
  if (rawValue.startsWith('"""') || rawValue.startsWith("'''")) {
    throw new Error(`Nomos pack profile uses unsupported TOML multiline string syntax for ${context}`);
  }
  if (!rawValue.startsWith('"') && /\s#/.test(rawValue)) {
    throw new Error(`Nomos pack profile uses unsupported TOML trailing comments for ${context}`);
  }
}

function consumeStructuredListBlock(lines: string[], startIndex: number) {
  const blockLines: string[] = [];
  let lastIndex = startIndex - 1;
  for (let blockIndex = startIndex; blockIndex < lines.length; blockIndex += 1) {
    const blockLine = lines[blockIndex] ?? '';
    if (!blockLine.trim()) {
      continue;
    }
    if (/^\s*- /.test(blockLine)) {
      blockLines.push(blockLine);
      lastIndex = blockIndex;
      continue;
    }
    break;
  }
  return {
    value: parseStructuredValue(blockLines.join('\n'), 'list block'),
    lastIndex,
  };
}

function safeJsonParse(rawValue: string, context: string): unknown {
  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    throw new Error(`Project Nomos authoring spec has invalid value for ${context}: ${rawValue}`);
  }
}

function parseStructuredValue(rawValue: string, context = 'value'): unknown {
  if (!rawValue.length) {
    return '';
  }
  if (rawValue.trim().startsWith('- ')) {
    return rawValue
      .split('\n')
      .map((entry) => entry.trim())
      .filter((entry) => entry.startsWith('- '))
      .map((entry) => entry.slice(2).trim());
  }
  if (rawValue.startsWith('[')) {
    return safeJsonParse(rawValue, context);
  }
  if (rawValue === 'null') {
    return null;
  }
  if (rawValue.startsWith('"')) {
    return safeJsonParse(rawValue, context);
  }
  return rawValue;
}
