const CRAFTSMAN_ADAPTER_ALIASES: Record<string, string> = {
  claude_code: 'claude',
  gemini_cli: 'gemini',
};

export function normalizeCraftsmanAdapter(adapter: string): string {
  return CRAFTSMAN_ADAPTER_ALIASES[adapter] ?? adapter;
}

