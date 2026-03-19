import templateGraphEditorSource from '../pages/TemplateGraphEditorPage.tsx?raw';
import todosPageSource from '../pages/TodosPage.tsx?raw';

describe('dashboard historical lint residual guardrails', () => {
  it('does not reset template graph inspector selection via setState inside an effect', () => {
    expect(templateGraphEditorSource).not.toMatch(/useEffect\([\s\S]*setSelectedGraphEdgeId\(null\)[\s\S]*setSelectedGraphNodeId\(null\)[\s\S]*\]/);
  });

  it('does not hydrate todo project preset via setState inside an effect', () => {
    expect(todosPageSource).not.toMatch(/useEffect\([\s\S]*presetProjectId[\s\S]*setProjectId\(presetProjectId\)[\s\S]*\]/);
  });
});
