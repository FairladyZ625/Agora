import { describe, expect, it } from 'vitest';
import { runScenarioCli } from './cli.js';

function createBuffer() {
  let value = '';
  return {
    write(chunk: string) {
      value += chunk;
    },
    get value() {
      return value;
    },
  };
}

describe('agora-ts scenario cli', () => {
  it('lists supported scenarios', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();

    const exitCode = await runScenarioCli(['list'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('happy-path');
    expect(stdout.value).toContain('cleanup-orphaned');
  });

  it('runs a single scenario and prints json output', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();

    const exitCode = await runScenarioCli(['happy-path', '--json'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.value).toBe('');
    expect(JSON.parse(stdout.value)).toMatchObject({
      name: 'happy-path',
      finalState: 'done',
    });
  });

  it('runs the full matrix when asked for all scenarios', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();

    const exitCode = await runScenarioCli(['all', '--json'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.value).toBe('');
    expect(JSON.parse(stdout.value)).toHaveLength(4);
  });
});
