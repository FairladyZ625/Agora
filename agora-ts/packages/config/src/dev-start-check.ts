import { validateDevPorts } from './dev-start.js';
import { DEFAULT_AGORA_BACKEND_PORT, DEFAULT_AGORA_FRONTEND_PORT, DEFAULT_AGORA_HOST } from './env.js';

async function main() {
  const backendPort = Number(process.argv[2] ?? DEFAULT_AGORA_BACKEND_PORT);
  const frontendPort = Number(process.argv[3] ?? DEFAULT_AGORA_FRONTEND_PORT);
  const host = process.argv[4] ?? DEFAULT_AGORA_HOST;

  if (!Number.isInteger(backendPort) || !Number.isInteger(frontendPort)) {
    console.error('Expected integer backend and frontend ports');
    process.exitCode = 1;
    return;
  }

  const conflicts = await validateDevPorts({ backendPort, frontendPort, host });

  if (conflicts.length === 0) {
    return;
  }

  for (const conflict of conflicts) {
    console.error(conflict);
  }
  process.exitCode = 1;
}

void main();
