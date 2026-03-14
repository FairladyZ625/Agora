import { describe, expect, it } from 'vitest';
import { classifyCliError, CLI_EXIT_CODES, renderCliError } from './errors.js';

describe('cli errors', () => {
  it('classifies usage errors and adds a help hint', () => {
    const error = classifyCliError(new Error('Invalid JSON for --team-json: unexpected token'), ['create']);

    expect(error.kind).toBe('usage');
    expect(error.exitCode).toBe(CLI_EXIT_CODES.usage);
    expect(error.hint).toContain('agora create --help');
  });

  it('classifies state errors', () => {
    const error = classifyCliError(new Error("Task OC-1 is in state 'paused', expected 'active'"), ['advance']);

    expect(error.kind).toBe('state');
    expect(error.exitCode).toBe(CLI_EXIT_CODES.state);
  });

  it('classifies environment errors', () => {
    const error = classifyCliError(new Error('database is locked'), ['status']);

    expect(error.kind).toBe('environment');
    expect(error.exitCode).toBe(CLI_EXIT_CODES.environment);
  });

  it('classifies integration errors', () => {
    const error = classifyCliError(new Error("Craftsman adapter 'claude' not configured"), ['craftsman', 'dispatch']);

    expect(error.kind).toBe('integration');
    expect(error.exitCode).toBe(CLI_EXIT_CODES.integration);
  });

  it('renders classified errors with title and hint', () => {
    const output = renderCliError(new Error('Invalid JSON for --team-json: bad payload'), ['create']);

    expect(output).toContain('Usage Error: Invalid JSON for --team-json: bad payload');
    expect(output).toContain('Hint: Try `agora create --help`.');
  });

  it('renders corrective subtask create guidance for execution_target errors', () => {
    const output = renderCliError(
      new Error("Smoke task OC-1 is in a craftsman-capable stage 'build', but subtask 'smoke' declares execution_target='manual'."),
      ['subtasks', 'create', 'OC-1'],
    );

    expect(output).toContain('Usage Error:');
    expect(output).toContain('Every subtask must declare `execution_target` explicitly');
    expect(output).toContain('"execution_target": "craftsman"');
    expect(output).toContain('agora subtasks create --help');
  });

  it('renders corrective craftsman input guidance for invalid execution state', () => {
    const output = renderCliError(
      new Error('Craftsman execution exec-123 is not waiting for input or running as an interactive session (status=succeeded)'),
      ['craftsman', 'input-text', 'exec-123', 'Continue'],
    );

    expect(output).toContain('State Error:');
    expect(output).toContain('agora craftsman input-text exec-123 "Continue"');
    expect(output).toContain('agora craftsman probe exec-123');
    expect(output).toContain('agora craftsman status <executionId>');
  });

  it('renders adapter-specific integration guidance', () => {
    const output = renderCliError(
      new Error("Craftsman adapter 'claude' not configured"),
      ['craftsman', 'dispatch'],
    );

    expect(output).toContain('Integration Error:');
    expect(output).toContain('Supported craftsman adapters');
    expect(output).toContain('claude_code');
  });

  it('renders corrective file guidance for missing --file paths', () => {
    const output = renderCliError(
      new Error("ENOENT: no such file or directory, open '/tmp/missing.json'"),
      ['subtasks', 'create', 'OC-1', '--caller-id', 'opus', '--file', '/tmp/missing.json'],
    );

    expect(output).toContain('Usage Error:');
    expect(output).toContain('The `--file` path does not exist or is unreadable.');
    expect(output).toContain('top-level `subtasks` array');
  });

  it('renders corrective guidance when craftsman execution ids are missing', () => {
    const output = renderCliError(
      new Error('Craftsman execution exec-123 not found'),
      ['craftsman', 'input-text', 'exec-123', 'Continue'],
    );

    expect(output).toContain('State Error:');
    expect(output).toContain('The execution id is unknown in the current database.');
    expect(output).toContain('agora craftsman history <taskId> <subtaskId>');
  });
});
