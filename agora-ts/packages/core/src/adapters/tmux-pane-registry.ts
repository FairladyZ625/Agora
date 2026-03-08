import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export type TmuxContinuityBackend = 'claude_session_id' | 'codex_session_file' | 'gemini_session_id' | 'unknown';
export type TmuxResumeCapability = 'native_resume' | 'resume_last' | 'none';
export type TmuxIdentitySource = 'registry_default' | 'hook_event' | 'session_file' | 'chat_file' | 'manual' | 'transport_session';
export type TmuxRecoveryMode = 'fresh_start' | 'resume_exact' | 'resume_latest' | 'resume_last';

export interface TmuxPaneState {
  continuityBackend: TmuxContinuityBackend;
  resumeCapability: TmuxResumeCapability;
  sessionReference: string | null;
  identitySource: TmuxIdentitySource;
  lastRecoveryMode: TmuxRecoveryMode | null;
  transportSessionId: string | null;
}

export interface TmuxPaneInfo extends TmuxPaneState {
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
  registryDir?: string;
}

export class TmuxPaneRegistry {
  private readonly execTmux: ExecLike;
  private readonly sessionName: string;
  private readonly windowName: string;
  private readonly registryDir: string;

  constructor(options: TmuxPaneRegistryOptions = {}) {
    this.execTmux = options.exec ?? defaultExec;
    this.sessionName = options.sessionName ?? 'agora-craftsmen';
    this.windowName = options.windowName ?? 'orchestrator';
    this.registryDir = options.registryDir ?? '/tmp/agora-ts-tmux-registry';
  }

  ensureSession() {
    this.ensureRegistryDir();
    try {
      this.execTmux(['has-session', '-t', this.sessionName]);
    } catch {
      this.execTmux(['new-session', '-d', '-s', this.sessionName, '-n', this.windowName, 'bash']);
      this.execTmux(['split-window', '-h', '-t', `${this.sessionName}:${this.windowName}`, 'bash']);
      this.execTmux(['split-window', '-v', '-t', `${this.sessionName}:${this.windowName}`, 'bash']);
      this.execTmux(['select-pane', '-t', '%0', '-T', 'codex']);
      this.execTmux(['select-pane', '-t', '%1', '-T', 'claude']);
      this.execTmux(['select-pane', '-t', '%2', '-T', 'gemini']);
    }
    for (const pane of this.listPaneTitles()) {
      this.ensurePaneState(pane.title);
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
          ...this.readPaneState(title),
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

  updatePaneState(agent: string, updates: Partial<TmuxPaneState>) {
    this.ensureSession();
    const next = {
      ...this.readPaneState(agent),
      ...updates,
    };
    this.writePaneState(agent, next);
    return next;
  }

  getPaneState(agent: string) {
    this.ensureSession();
    return this.readPaneState(agent);
  }

  private listPaneTitles() {
    const output = this.execTmux([
      'list-panes',
      '-t',
      `${this.sessionName}:${this.windowName}`,
      '-F',
      '#{pane_id}|#{pane_title}',
    ]);
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, title] = line.split('|');
        if (!id || !title) {
          throw new Error(`invalid tmux pane line: ${line}`);
        }
        return { id, title };
      });
  }

  private ensureRegistryDir() {
    mkdirSync(this.registryDir, { recursive: true });
  }

  private ensurePaneState(agent: string) {
    const path = this.registryFile(agent);
    if (!existsSync(path)) {
      this.writePaneState(agent, defaultPaneState(agent));
    }
  }

  private readPaneState(agent: string): TmuxPaneState {
    this.ensurePaneState(agent);
    const raw = JSON.parse(readFileSync(this.registryFile(agent), 'utf8')) as Record<string, string | null>;
    return {
      continuityBackend: (raw.continuity_backend as TmuxContinuityBackend | null) ?? 'unknown',
      resumeCapability: (raw.resume_capability as TmuxResumeCapability | null) ?? 'none',
      sessionReference: raw.session_reference ?? null,
      identitySource: (raw.identity_source as TmuxIdentitySource | null) ?? 'registry_default',
      lastRecoveryMode: (raw.last_recovery_mode as TmuxRecoveryMode | null) ?? null,
      transportSessionId: raw.transport_session_id ?? null,
    };
  }

  private writePaneState(agent: string, state: TmuxPaneState) {
    writeFileSync(
      this.registryFile(agent),
      JSON.stringify(
        {
          continuity_backend: state.continuityBackend,
          resume_capability: state.resumeCapability,
          session_reference: state.sessionReference,
          identity_source: state.identitySource,
          last_recovery_mode: state.lastRecoveryMode,
          transport_session_id: state.transportSessionId,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  private registryFile(agent: string) {
    return join(this.registryDir, `${agent}.json`);
  }
}

function defaultPaneState(agent: string): TmuxPaneState {
  switch (agent) {
    case 'claude':
      return {
        continuityBackend: 'claude_session_id',
        resumeCapability: 'native_resume',
        sessionReference: null,
        identitySource: 'registry_default',
        lastRecoveryMode: null,
        transportSessionId: null,
      };
    case 'codex':
      return {
        continuityBackend: 'codex_session_file',
        resumeCapability: 'native_resume',
        sessionReference: null,
        identitySource: 'registry_default',
        lastRecoveryMode: null,
        transportSessionId: null,
      };
    case 'gemini':
      return {
        continuityBackend: 'gemini_session_id',
        resumeCapability: 'native_resume',
        sessionReference: null,
        identitySource: 'registry_default',
        lastRecoveryMode: null,
        transportSessionId: null,
      };
    default:
      return {
        continuityBackend: 'unknown',
        resumeCapability: 'none',
        sessionReference: null,
        identitySource: 'registry_default',
        lastRecoveryMode: null,
        transportSessionId: null,
      };
  }
}

function defaultExec(args: string[]) {
  return execFileSync('tmux', args, {
    encoding: 'utf8',
  });
}
