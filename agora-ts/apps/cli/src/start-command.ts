import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StartCommandRunnerRequest {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type StartCommandRunner = (request: StartCommandRunnerRequest) => Promise<void>;

export interface RunStartCommandOptions {
  cwd?: string;
  fallbackRoot?: string;
  runner?: StartCommandRunner;
}

function hasDevStartScript(root: string): boolean {
  return existsSync(join(root, 'docs/02-PRODUCT/scripts/dev-start.sh'));
}

export function findAgoraProjectRoot(startDir: string): string | null {
  let current = startDir;

  while (true) {
    if (hasDevStartScript(current)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function bundledCliRoot(): string {
  return fileURLToPath(new URL('../../../../', import.meta.url));
}

async function defaultStartCommandRunner(request: StartCommandRunnerRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      env: request.env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`本地开发栈启动被信号中断: ${signal}`));
        return;
      }

      reject(new Error(`本地开发栈启动失败，退出码: ${String(code)}`));
    });
  });
}

export async function runStartCommand(options: RunStartCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const fallbackRoot = options.fallbackRoot ?? bundledCliRoot();
  const projectRoot = findAgoraProjectRoot(cwd) ?? findAgoraProjectRoot(fallbackRoot);
  if (!projectRoot) {
    throw new Error('未找到 Agora 项目根目录；请在仓库内运行 `agora start`。');
  }

  const runner = options.runner ?? defaultStartCommandRunner;
  await runner({
    command: 'bash',
    args: [join(projectRoot, 'docs/02-PRODUCT/scripts/dev-start.sh')],
    cwd: projectRoot,
    env: process.env,
  });
}
