import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useProjectStore } from '@/stores/projectStore';

export function useProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const detailLoading = useProjectStore((state) => state.detailLoading);
  const error = useProjectStore((state) => state.error);
  const selectProject = useProjectStore((state) => state.selectProject);

  useEffect(() => {
    void selectProject(projectId ?? null);
  }, [projectId, selectProject]);

  return {
    projectId,
    selectedProject,
    detailLoading,
    error,
  };
}
