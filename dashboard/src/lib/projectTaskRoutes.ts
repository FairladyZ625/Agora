export function buildProjectWorkHref(projectId?: string | null) {
  return projectId ? `/projects/${projectId}/work` : '/projects';
}

export function buildProjectTaskHref(taskId: string, projectId?: string | null) {
  return projectId ? `/projects/${projectId}/work/${taskId}` : `/tasks/${taskId}`;
}
