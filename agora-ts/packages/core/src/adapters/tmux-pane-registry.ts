import { execFileSync } from 'node:child_process';

export interface TmuxPaneInfo {
  id: string;
  title: string;
  currentCommand: string;
  active: boolean;
}

type ExecLike = (args: string[]) => string;

export interface TmuxPaneRegistryOptions {
  exec?: ExecLike;
  sessionName?: string;
  windowName?: string;
}

export class TmuxPaneRegistry {
  private readonly execTmux: ExecLike;
  private readonly sessionName: string;
  private readonly windowName: string;

  constructor(options: TmuxPaneRegistryOptions = {}) {
    this.execTmux = options.exec ?? defaultExec;
    this.sessionName = options.sessionName ?? 'agora-craftsmen';
    this.windowName = options.windowName ?? 'orchestrator';
  }

  ensureSession() {
    try {
      this.execTmux(['has-session', '-t', this.sessionName]);
      return;
    } catch {
      this.execTmux(['new-session', '-d', '-s', this.sessionName, '-n', this.windowName, 'bash']);
      this.execTmux(['split-window', '-h', '-t', `${this.sessionName}:${this.windowName}`, 'bash']);
      this.execTmux(['split-window', '-v', '-t', `${this.sessionName}:${this.windowName}`, 'bash']);
      this.execTmux(['select-pane', '-t', '%0', '-T', 'codex']);
      this.execTmux(['select-pane', '-t', '%1', '-T', 'claude']);
      this.execTmux(['select-pane', '-t', '%2', '-T', 'gemini']);
    }
  }

  listPanes(): TmuxPaneInfo[] {
    this.ensureSession();
    const output = this.execTmux([
      'list-panes',
      '-t',
      `${this.sessionName}:${this.windowName}`,
      '-F',
      '#{pane_id}|#{pane_title}|#{pane_current_command}|#{pane_active}',
    ]);
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, title, currentCommand, active] = line.split('|');
        if (!id || !title || !currentCommand || !active) {
          throw new Error(`invalid tmux pane line: ${line}`);
        }
        return {
          id,
          title,
          currentCommand,
          active: active === '1',
        };
      });
  }

  getPaneTarget(agent: string): string {
    this.ensureSession();
    const output = this.execTmux([
      'list-panes',
      '-t',
      `${this.sessionName}:${this.windowName}`,
      '-F',
      '#{pane_id}|#{pane_title}',
    ]);
    const match = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, title] = line.split('|');
        if (!id || !title) {
          throw new Error(`invalid tmux pane line: ${line}`);
        }
        return { id, title };
      })
      .find((pane) => pane.title === agent);
    if (!match) {
      throw new Error(`tmux pane not found for agent: ${agent}`);
    }
    return match.id;
  }

  sendKeys(target: string, text: string) {
    this.execTmux(['send-keys', '-t', target, '-l', '--', text]);
    this.execTmux(['send-keys', '-t', target, 'Enter']);
  }

  capturePane(target: string, lines = 40) {
    return this.execTmux(['capture-pane', '-p', '-S', `-${lines}`, '-t', target]);
  }

  killSession() {
    this.execTmux(['kill-session', '-t', this.sessionName]);
  }

  getSessionName() {
    return this.sessionName;
  }
}

function defaultExec(args: string[]) {
  return execFileSync('tmux', args, {
    encoding: 'utf8',
  });
}
