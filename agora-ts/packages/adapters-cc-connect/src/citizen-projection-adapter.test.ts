import { describe, expect, it } from 'vitest';
import { CcConnectCitizenProjectionAdapter } from './citizen-projection-adapter.js';

describe('CcConnectCitizenProjectionAdapter', () => {
  it('renders a cc-connect citizen projection preview', () => {
    const adapter = new CcConnectCitizenProjectionAdapter();
    const preview = adapter.renderPreview({
      citizen: {
        citizen_id: 'citizen-cc',
        project_id: 'proj-alpha',
        role_id: 'architect',
        display_name: 'CC Architect',
        persona: 'Systems thinker',
        boundaries: ['Keep provider state outside core.'],
        skills_ref: ['system-design'],
        channel_policies: {},
        brain_scaffold_mode: 'role_default',
        runtime_projection: {
          adapter: 'cc-connect',
          auto_provision: false,
          metadata: {},
        },
        status: 'active',
        created_at: '2026-04-10T00:00:00.000Z',
        updated_at: '2026-04-10T00:00:00.000Z',
      },
      roleDefinition: {
        id: 'architect',
        name: 'Architect',
        member_kind: 'citizen',
        summary: 'Design systems.',
        prompt_asset: 'roles/architect.md',
        source: 'test',
        source_ref: null,
        default_model_preference: null,
        allowed_target_kinds: ['runtime_agent'],
        citizen_scaffold: {
          soul: 'Think in systems.',
          boundaries: ['Stay core-first.'],
          heartbeat: ['Restate objective.'],
          recap_expectations: ['Summarize next step.'],
        },
        metadata: {},
      },
      project: {
        id: 'proj-alpha',
        name: 'Project Alpha',
        summary: null,
        owner: null,
        status: 'active',
      },
    });

    expect(preview.adapter).toBe('cc-connect');
    expect(preview.summary).toContain('cc-connect preview');
    expect(preview.files).toEqual([
      expect.objectContaining({
        path: '.cc-connect/citizens/citizen-cc/profile.json',
      }),
      expect.objectContaining({
        path: '.cc-connect/citizens/citizen-cc/brain/03-citizen-scaffold.md',
      }),
    ]);
    expect(preview.files[1]?.content).toContain('bridge_host: `cc-connect`');
    expect(preview.files[1]?.content).toContain('Keep provider state outside core.');
    expect(preview.files[1]?.content).toContain('Think in systems.');
    expect(preview.metadata).toEqual({
      project_id: 'proj-alpha',
      role_id: 'architect',
      auto_provision: false,
      bridge_host: 'cc-connect',
    });
  });
});
