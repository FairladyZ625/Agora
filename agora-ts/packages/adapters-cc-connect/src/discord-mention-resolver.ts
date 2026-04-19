import { loadCcConnectProjectTargets, type CcConnectProjectTarget } from './config-targets.js';

export function createCcConnectDiscordMentionResolver(
  targets: CcConnectProjectTarget[] = loadCcConnectProjectTargets(),
) {
  const mentionMap = new Map<string, string[]>();

  for (const target of targets) {
    for (const userId of target.discord?.bot_user_ids ?? []) {
      const aliases = mentionMap.get(userId) ?? [];
      for (const alias of [`cc-connect:${target.projectName}`, target.projectName]) {
        if (!aliases.includes(alias)) {
          aliases.push(alias);
        }
      }
      mentionMap.set(userId, aliases);
    }
  }

  return (body: string) => {
    const resolved = new Set<string>();
    for (const userId of extractDiscordMentions(body)) {
      const aliases = mentionMap.get(userId);
      if (!aliases) {
        continue;
      }
      for (const alias of aliases) {
        resolved.add(alias);
      }
    }
    return Array.from(resolved);
  };
}

function extractDiscordMentions(body: string) {
  const matches = body.match(/<@!?([0-9]{15,25})>/g);
  if (!matches) {
    return [];
  }
  return matches
    .map((value) => value.match(/<@!?([0-9]{15,25})>/)?.[1] ?? null)
    .filter((value): value is string => Boolean(value));
}
