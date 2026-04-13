import type { ProjectSummary, ProjectWorkbench } from '@/types/project';

export const PROJECTS_PAGE_SELECTION_KEY = 'agora-projects-selected-project';

export type ProjectsPageSortKey = 'updated' | 'tasks' | 'todos' | 'name';

type ProjectBriefingMap = Record<string, ProjectWorkbench | undefined>;

const PROJECT_NAME_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? '';
}

function compareUpdatedAt(left: ProjectSummary, right: ProjectSummary) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

function compareByName(left: ProjectSummary, right: ProjectSummary) {
  return PROJECT_NAME_COLLATOR.compare(left.name, right.name);
}

function compareWithFallback(left: ProjectSummary, right: ProjectSummary) {
  const updatedDelta = compareUpdatedAt(left, right);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return compareByName(left, right);
}

function getTaskCount(project: ProjectSummary, briefingsByProject: ProjectBriefingMap) {
  return briefingsByProject[project.id]?.overview.stats.taskCount ?? -1;
}

function getPendingTodoCount(project: ProjectSummary, briefingsByProject: ProjectBriefingMap) {
  return briefingsByProject[project.id]?.overview.stats.pendingTodoCount ?? -1;
}

export function filterProjectsForWorkbench(projects: ProjectSummary[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return projects;
  }

  return projects.filter((project) => {
    const haystack = [
      project.name,
      project.id,
      project.summary,
      project.owner,
    ]
      .map(normalize)
      .join('\n');
    return haystack.includes(normalizedQuery);
  });
}

export function sortProjectsForWorkbench(
  projects: ProjectSummary[],
  sortKey: ProjectsPageSortKey,
  briefingsByProject: ProjectBriefingMap = {},
) {
  return [...projects].sort((left, right) => {
    if (sortKey === 'name') {
      return compareByName(left, right);
    }

    if (sortKey === 'tasks') {
      const delta = getTaskCount(right, briefingsByProject) - getTaskCount(left, briefingsByProject);
      if (delta !== 0) {
        return delta;
      }
      return compareWithFallback(left, right);
    }

    if (sortKey === 'todos') {
      const delta = getPendingTodoCount(right, briefingsByProject) - getPendingTodoCount(left, briefingsByProject);
      if (delta !== 0) {
        return delta;
      }
      return compareWithFallback(left, right);
    }

    return compareWithFallback(left, right);
  });
}

export function readProjectsPageSelection() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedProjectId = window.localStorage.getItem(PROJECTS_PAGE_SELECTION_KEY);
    return storedProjectId?.trim() ? storedProjectId : null;
  } catch {
    return null;
  }
}

export function writeProjectsPageSelection(projectId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (projectId) {
      window.localStorage.setItem(PROJECTS_PAGE_SELECTION_KEY, projectId);
      return;
    }
    window.localStorage.removeItem(PROJECTS_PAGE_SELECTION_KEY);
  } catch {
    // Ignore storage write failures; selection recovery is a progressive enhancement.
  }
}

export function pickProjectsPageSelection(
  projects: ProjectSummary[],
  sortKey: ProjectsPageSortKey,
  briefingsByProject: ProjectBriefingMap = {},
) {
  const rememberedProjectId = readProjectsPageSelection();
  if (rememberedProjectId && projects.some((project) => project.id === rememberedProjectId)) {
    return rememberedProjectId;
  }

  return sortProjectsForWorkbench(projects, sortKey, briefingsByProject)[0]?.id ?? null;
}
