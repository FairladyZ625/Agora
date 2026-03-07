import { beforeEach, describe, expect, it } from 'vitest';
import { getPriorityMeta, getStateMeta } from '@/lib/taskMeta';
import { DEFAULT_LOCALE, setLocale } from '@/lib/i18n';

describe('task meta localization', () => {
  beforeEach(async () => {
    await setLocale(DEFAULT_LOCALE);
  });

  it('returns localized state labels without changing tone', async () => {
    await setLocale('zh-CN');
    const zh = getStateMeta('gate_waiting');

    await setLocale('en-US');
    const en = getStateMeta('gate_waiting');

    expect(zh.label).toBe('待审批');
    expect(en.label).toBe('Awaiting review');
    expect(zh.tone).toBe(en.tone);
  });

  it('returns localized priority labels without changing tone', async () => {
    await setLocale('zh-CN');
    const zh = getPriorityMeta('critical');

    await setLocale('en-US');
    const en = getPriorityMeta('critical');

    expect(zh.label).toBe('关键');
    expect(en.label).toBe('Critical');
    expect(zh.tone).toBe(en.tone);
  });
});
