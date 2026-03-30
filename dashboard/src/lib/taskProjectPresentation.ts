import type { ProjectSummary } from '@/types/project';
import type { Task } from '@/types/task';

export const ALL_PROJECTS_FILTER_VALUE = '__all_projects__';
export const UNASSIGNED_PROJECT_FILTER_VALUE = '__unassigned_project__';

export interface TaskProjectPresentation {
  projectId: string | null;
  filterValue: string;
  label: string;
}

export interface TaskProjectGroup {
  key: string;
  projectId: string | null;
  label: string;
  tasks: Task[];
}

export function buildTaskProjectNameMap(projects: ProjectSummary[]) {
  return new Map(projects.map((project) => [project.id, project.name]));
}

export function getTaskProjectPresentation(
  task: Task,
  projectNameMap: Map<string, string>,
  unassignedLabel: string,
): TaskProjectPresentation {
  if (!task.projectId) {
    return {
      projectId: null,
      filterValue: UNASSIGNED_PROJECT_FILTER_VALUE,
      label: unassignedLabel,
    };
  }

  const projectName = projectNameMap.get(task.projectId);
  return {
    projectId: task.projectId,
    filterValue: task.projectId,
    label: projectName ?? task.projectId,
  };
}

export function filterTasksByProject(tasks: Task[], projectFilter: string) {
  if (projectFilter === ALL_PROJECTS_FILTER_VALUE) {
    return tasks;
  }
  if (projectFilter === UNASSIGNED_PROJECT_FILTER_VALUE) {
    return tasks.filter((task) => !task.projectId);
  }
  return tasks.filter((task) => task.projectId === projectFilter);
}

export function buildTaskProjectGroups(
  tasks: Task[],
  projects: ProjectSummary[],
  unassignedLabel: string,
): TaskProjectGroup[] {
  const projectNameMap = buildTaskProjectNameMap(projects);
  const groups = new Map<string, TaskProjectGroup>();

  for (const task of tasks) {
    const projectId = task.projectId ?? null;
    const key = projectId ?? UNASSIGNED_PROJECT_FILTER_VALUE;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        projectId,
        label: projectId ? projectNameMap.get(projectId) ?? projectId : unassignedLabel,
        tasks: [],
      });
    }
    groups.get(key)?.tasks.push(task);
  }

  const orderedGroups = projects
    .map((project) => groups.get(project.id))
    .filter((group): group is TaskProjectGroup => Boolean(group));
  const fallbackGroups = [...groups.values()]
    .filter((group) => group.projectId && !projectNameMap.has(group.projectId))
    .sort((left: TaskProjectGroup, right: TaskProjectGroup) => left.label.localeCompare(right.label));
  const unassignedGroup = groups.get(UNASSIGNED_PROJECT_FILTER_VALUE);

  return [
    ...orderedGroups,
    ...fallbackGroups,
    ...(unassignedGroup ? [unassignedGroup] : []),
  ];
}

export function buildTaskProjectFilterOptions(
  tasks: Task[],
  projects: ProjectSummary[],
  unassignedLabel: string,
) {
  return buildTaskProjectGroups(tasks, projects, unassignedLabel).map((group) => ({
    value: group.key,
    label: group.label,
    count: group.tasks.length,
  }));
}
