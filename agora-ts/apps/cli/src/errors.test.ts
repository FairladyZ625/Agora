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
});

