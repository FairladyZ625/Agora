import { describe, expect, it } from 'vitest';
import { runScenarioCli } from './cli.js';
import { scenarioNames } from './scenarios.js';

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
    expect(stdout.value).toContain('archive-notify');
    expect(stdout.value).toContain('archive-receipt');
    expect(stdout.value).toContain('unblock-retry');
    expect(stdout.value).toContain('unblock-skip');
    expect(stdout.value).toContain('unblock-reassign');
    expect(stdout.value).toContain('pause-resume-deferred-callback');
    expect(stdout.value).toContain('pause-resume-missing-session');
    expect(stdout.value).toContain('cancel-active-task');
    expect(stdout.value).toContain('inbox-promote');
    expect(stdout.value).toContain('authoring-smoke');
    expect(stdout.value).toContain('control-plane-loop');
    expect(stdout.value).toContain('graph-driven-path');
    expect(stdout.value).toContain('project-brain-bootstrap');
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

  it('runs a single scenario and prints the text summary by default', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();

    const exitCode = await runScenarioCli(['happy-path'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.value).toBe('');
    expect(stdout.value).toContain('scenario=happy-path');
    expect(stdout.value).toContain('state=done');
    expect(stdout.value).toContain('events=');
  });

  it('runs the full matrix when asked for all scenarios', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();

    const exitCode = await runScenarioCli(['all', '--json'], { stdout, stderr });

    expect(exitCode).toBe(0);
    expect(stderr.value).toBe('');
    const results = JSON.parse(stdout.value);
    expect(results).toHaveLength(scenarioNames.length);
    expect(results.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining([
        'archive-notify',
        'archive-receipt',
        'unblock-retry',
        'unblock-skip',
        'unblock-reassign',
        'pause-resume-deferred-callback',
        'pause-resume-missing-session',
        'startup-recovery-missing-session',
        'cancel-active-task',
        'inbox-promote',
        'authoring-smoke',
        'craftsman-concurrency-limit',
        'craftsman-workdir-isolation',
        'control-plane-loop',
        'graph-driven-path',
        'project-brain-bootstrap',
      ]),
    );
  }, 30000);

  it('returns usage guidance for unknown commands', async () => {
    const stdout = createBuffer();
    const stderr = createBuffer();

    const exitCode = await runScenarioCli(['unknown-scenario'], { stdout, stderr });

    expect(exitCode).toBe(1);
    expect(stdout.value).toBe('');
    expect(stderr.value).toContain('Unknown scenario command: unknown-scenario');
    expect(stderr.value).toContain('Usage: scenario [list|all|');
  });
});
