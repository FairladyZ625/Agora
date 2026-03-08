import { runAllScenarios, runScenarioIsolated, scenarioNames, type ScenarioName } from './scenarios.js';

type Writable = {
  write: (chunk: string) => void;
};

export interface ScenarioCliOptions {
  stdout?: Writable;
  stderr?: Writable;
}

export async function runScenarioCli(
  argv: string[],
  options: ScenarioCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const json = argv.includes('--json');
  const args = argv.filter((item) => item !== '--json');
  const command = args[0] ?? 'list';

  if (command === 'list') {
    write(stdout, scenarioNames.join('\n'));
    return 0;
  }

  if (command === 'all') {
    const results = runAllScenarios();
    write(stdout, json ? JSON.stringify(results) : formatScenarioList(results));
    return 0;
  }

  if (isScenarioName(command)) {
    const result = runScenarioIsolated(command);
    write(stdout, json ? JSON.stringify(result) : formatScenario(result));
    return 0;
  }

  write(stderr, `Unknown scenario command: ${command}\nUsage: scenario [list|all|${scenarioNames.join('|')}] [--json]`);
  return 1;
}

function isScenarioName(value: string): value is ScenarioName {
  return scenarioNames.includes(value as ScenarioName);
}

function formatScenario(result: ReturnType<typeof runScenarioIsolated>) {
  return [
    `scenario=${result.name}`,
    `task=${result.taskId}`,
    `state=${result.finalState}`,
    `stage=${result.currentStage ?? '-'}`,
    `events=${result.events.join(',')}`,
  ].join('\n');
}

function formatScenarioList(results: ReturnType<typeof runAllScenarios>) {
  return results.map((result) => `${result.name}\t${result.finalState}\t${result.taskId}`).join('\n');
}

function write(stream: Writable, message: string) {
  stream.write(`${message}\n`);
}

const isEntrypoint = process.argv[1] ? import.meta.url === new URL(`file://${process.argv[1]}`).href : false;

if (isEntrypoint) {
  runScenarioCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
