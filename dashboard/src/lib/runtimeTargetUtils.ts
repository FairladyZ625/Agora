import type { RuntimeTarget } from '@/types/runtime-target';

export function isRuntimeTargetAllowedForProject(target: RuntimeTarget, projectId?: string | null) {
  if (!target.enabled) {
    return false;
  }
  if (!projectId || target.allowedProjects.length === 0) {
    return true;
  }
  return target.allowedProjects.includes(projectId);
}

export function getRuntimeTargetLabel(target: RuntimeTarget) {
  return target.displayName ?? target.runtimeTargetRef;
}
