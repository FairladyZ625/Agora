export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  return JSON.parse(value) as T;
}

export function stringifyJsonValue(value: unknown): string {
  return JSON.stringify(value);
}
