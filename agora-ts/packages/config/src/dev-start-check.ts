import { validateDevPorts } from './dev-start.js';

async function main() {
  const backendPort = Number(process.argv[2] ?? '8420');
  const frontendPort = Number(process.argv[3] ?? '5173');
  const host = process.argv[4] ?? '127.0.0.1';

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
