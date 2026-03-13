export function parseJsonResponse(value: string, context: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid ${context}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
