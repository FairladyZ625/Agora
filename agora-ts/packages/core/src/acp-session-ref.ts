export function buildAcpSessionId(sessionName: string) {
  return `acpx:${sessionName}`;
}

export function parseAcpSessionId(sessionId: string | null) {
  if (!sessionId || !sessionId.startsWith('acpx:')) {
    return null;
  }
  const sessionName = sessionId.slice('acpx:'.length).trim();
  return sessionName.length > 0 ? sessionName : null;
}
