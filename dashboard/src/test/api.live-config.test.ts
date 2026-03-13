import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listTasks } from '@/lib/api';

describe('api live config handling', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('surfaces invalid persisted dashboard settings instead of silently falling back', async () => {
    localStorage.setItem('agora-settings', '{invalid-json');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(listTasks()).rejects.toThrow(/invalid dashboard settings/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
