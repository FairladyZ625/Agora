import { resources } from '@/locales/resources';

const bannedLegacyPhrases = [
  '多 Agent 协作编排中枢',
  '品牌主舞台',
  'Agora 不是普通控制台',
  '广场，而不是后台',
  '高密度，但不凌乱',
  '品牌语义落点',
  '人在回路的最终判断',
  'private thread',
  'Multi-agent orchestration hub',
  'The brand pages explain Agora',
  'Agora is not a generic console',
  'A plaza, not a back office',
  'Dense, never chaotic',
  'Where the brand language lands',
  'Human-in-the-loop final judgment',
];

describe('dashboard copy governance', () => {
  it('removes legacy abstract brand language from shared resources', () => {
    const serializedResources = JSON.stringify(resources);

    bannedLegacyPhrases.forEach((phrase) => {
      expect(serializedResources).not.toContain(phrase);
    });
  });
});
