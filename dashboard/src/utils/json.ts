export function parseJsonWithContext<T>(value: string, context: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Invalid ${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
