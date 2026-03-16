import type { CraftsmanRuntimeStatus, TmuxRuntimeStatus } from '@/types/dashboard';

export type MemberKind = 'controller' | 'citizen' | 'craftsman';

const CRAFTSMAN_ROLE_IDS = new Set(['craftsman']);
const CRAFTSMAN_ID_ALIASES: Record<string, string> = {
  claude_code: 'claude',
  gemini_cli: 'gemini',
};

export function resolveMemberKind(role: string, memberKind?: MemberKind | null): MemberKind {
  if (memberKind) {
    return memberKind;
  }
  return CRAFTSMAN_ROLE_IDS.has(role) ? 'craftsman' : 'citizen';
}

export function isCraftsmanRole(role: string, memberKind?: MemberKind | null): boolean {
  return resolveMemberKind(role, memberKind) === 'craftsman';
}

export function isCitizenRole(role: string, memberKind?: MemberKind | null): boolean {
  return resolveMemberKind(role, memberKind) !== 'craftsman';
}

export function normalizeCraftsmanId(value: string): string {
  return CRAFTSMAN_ID_ALIASES[value] ?? value;
}

export function normalizeRoleBindingId(role: string, value: string, memberKind?: MemberKind | null): string {
  return isCraftsmanRole(role, memberKind) ? normalizeCraftsmanId(value) : value;
}

export function buildCraftsmanInventory(runtime: CraftsmanRuntimeStatus | TmuxRuntimeStatus | null): string[] {
  if (!runtime) {
    return [];
  }
  const agents = 'slots' in runtime ? runtime.slots.map((slot) => slot.agent) : runtime.panes.map((pane) => pane.agent);
  return Array.from(new Set(agents.map((agent) => normalizeCraftsmanId(agent)))).sort((left, right) => (
    left.localeCompare(right)
  ));
}
