import '@/lib/i18n';
import { MemoryRouter } from 'react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/lib/i18n';
import { RuntimeTargetsPage } from '@/pages/RuntimeTargetsPage';

const apiMocks = vi.hoisted(() => ({
  listRuntimeTargets: vi.fn(async () => ([
    {
      runtimeTargetRef: 'cc-connect:agora-claude',
      inventoryKind: 'runtime_target' as const,
      runtimeProvider: 'cc-connect',
      runtimeFlavor: 'claude-code',
      hostFramework: 'cc-connect',
      primaryModel: 'claude-sonnet-4.5',
      workspaceDir: '/Users/lizeyu/Projects/Agora',
      channelProviders: ['discord'],
      inventorySources: ['cc-connect'],
      discordBotUserIds: ['1234567890'],
      enabled: true,
      displayName: 'Agora Claude Runtime',
      tags: ['review'],
      allowedProjects: ['proj-alpha'],
      defaultRoles: ['reviewer'],
      presentationMode: 'im_presented' as const,
      presentationProvider: 'discord',
      presentationIdentityRef: '1234567890',
      metadata: null,
      discovered: true,
    },
  ])),
  updateRuntimeTargetOverlay: vi.fn(async () => ({
    runtimeTargetRef: 'cc-connect:agora-claude',
    inventoryKind: 'runtime_target' as const,
    runtimeProvider: 'cc-connect',
    runtimeFlavor: 'claude-code',
    hostFramework: 'cc-connect',
    primaryModel: 'claude-sonnet-4.5',
    workspaceDir: '/Users/lizeyu/Projects/Agora',
    channelProviders: ['discord'],
    inventorySources: ['cc-connect'],
    discordBotUserIds: ['1234567890'],
    enabled: true,
    displayName: 'Claude Review',
    tags: ['review', 'presented'],
    allowedProjects: ['proj-alpha', 'proj-beta'],
    defaultRoles: ['reviewer'],
    presentationMode: 'im_presented' as const,
    presentationProvider: 'discord',
    presentationIdentityRef: '1234567890',
    metadata: null,
    discovered: true,
  })),
  clearRuntimeTargetOverlay: vi.fn(async () => undefined),
}));

const showMessage = vi.fn();

vi.mock('@/lib/api', () => ({
  listRuntimeTargets: apiMocks.listRuntimeTargets,
  updateRuntimeTargetOverlay: apiMocks.updateRuntimeTargetOverlay,
  clearRuntimeTargetOverlay: apiMocks.clearRuntimeTargetOverlay,
}));

vi.mock('@/stores/feedbackStore', () => ({
  useFeedbackStore: () => ({
    showMessage,
  }),
}));

describe('runtime targets page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setLocale('en-US');
  });

  it('loads runtime targets and updates overlay settings', async () => {
    render(
      <MemoryRouter>
        <RuntimeTargetsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Runtime Targets' })).toBeInTheDocument();
    expect(screen.getByText('Agora Claude Runtime')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Display Name cc-connect:agora-claude'), {
      target: { value: 'Claude Review' },
    });
    fireEvent.change(screen.getByLabelText('Tags cc-connect:agora-claude'), {
      target: { value: 'review, presented' },
    });
    fireEvent.change(screen.getByLabelText('Allowed Projects cc-connect:agora-claude'), {
      target: { value: 'proj-alpha, proj-beta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Overlay cc-connect:agora-claude' }));

    await waitFor(() => {
      expect(apiMocks.updateRuntimeTargetOverlay).toHaveBeenCalledWith('cc-connect:agora-claude', {
        enabled: true,
        displayName: 'Claude Review',
        tags: ['review', 'presented'],
        allowedProjects: ['proj-alpha', 'proj-beta'],
        defaultRoles: ['reviewer'],
        presentationMode: 'im_presented',
        presentationProvider: 'discord',
        presentationIdentityRef: '1234567890',
      });
    });
    expect(showMessage).toHaveBeenCalled();
  });

  it('clears an overlay and refreshes the inventory', async () => {
    render(
      <MemoryRouter>
        <RuntimeTargetsPage />
      </MemoryRouter>,
    );

    await screen.findByText('Agora Claude Runtime');
    fireEvent.click(screen.getByRole('button', { name: 'Clear Overlay cc-connect:agora-claude' }));

    await waitFor(() => {
      expect(apiMocks.clearRuntimeTargetOverlay).toHaveBeenCalledWith('cc-connect:agora-claude');
    });
    expect(apiMocks.listRuntimeTargets).toHaveBeenCalledTimes(2);
  });
});
