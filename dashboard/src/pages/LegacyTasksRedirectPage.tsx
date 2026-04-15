import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import * as api from '@/lib/api';
import { buildProjectTaskHref, buildProjectWorkHref } from '@/lib/projectTaskRoutes';
import { useProjectStore } from '@/stores/projectStore';
import { useTaskStore } from '@/stores/taskStore';

function resolveProjectIdFromStores(
  taskId: string,
  tasks: Array<{ id: string; projectId?: string | null }>,
  selectedProject: { project: { id: string }; work: { tasks: Array<{ id: string; projectId: string | null }> } } | null,
) {
  const taskMatch = tasks.find((task) => task.id === taskId);
  if (taskMatch?.projectId) {
    return taskMatch.projectId;
  }
  if (selectedProject?.work.tasks.some((task) => task.id === taskId)) {
    return selectedProject.project.id;
  }
  return null;
}

export function LegacyTasksRedirectPage() {
  const { taskId } = useParams<{ taskId?: string }>();
  const tasks = useTaskStore((state) => state.tasks);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const [resolvedProjectId, setResolvedProjectId] = useState<string | null>(() => (
    taskId ? resolveProjectIdFromStores(taskId, tasks, selectedProject) : null
  ));
  const [loading, setLoading] = useState(Boolean(taskId));

  const directHref = useMemo(() => {
    const resolvedTaskId = taskId;
    if (!resolvedTaskId) {
      return buildProjectWorkHref();
    }
    const projectId = resolveProjectIdFromStores(resolvedTaskId, tasks, selectedProject) ?? resolvedProjectId;
    return projectId ? buildProjectTaskHref(resolvedTaskId, projectId) : null;
  }, [resolvedProjectId, selectedProject, taskId, tasks]);

  useEffect(() => {
    const resolvedTaskId = taskId;
    if (!resolvedTaskId || directHref) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function resolveFromApis() {
      setLoading(true);
      try {
        if (tasks.length === 0) {
          await fetchTasks();
        }
        const task = await api.getTask(resolvedTaskId!);
        if (!cancelled) {
          setResolvedProjectId(task.project_id ?? null);
        }
      } catch {
        if (!cancelled) {
          setResolvedProjectId(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void resolveFromApis();
    return () => {
      cancelled = true;
    };
  }, [directHref, fetchTasks, taskId, tasks.length]);

  if (!taskId) {
    return <Navigate to="/projects" replace />;
  }

  if (directHref) {
    return <Navigate to={directHref} replace />;
  }

  if (loading) {
    return (
      <section className="surface-panel surface-panel--workspace">
        <p className="type-body-sm">Redirecting task deep link into the project workspace…</p>
      </section>
    );
  }

  return (
    <section className="surface-panel surface-panel--workspace">
      <div className="space-y-3">
        <p className="page-kicker">TASK ROUTE BRIDGE</p>
        <h2 className="page-title">Task link needs a project context</h2>
        <p className="page-summary">
          This task does not expose a project binding yet, so the legacy task route cannot be rewritten into the new workspace shell.
        </p>
      </div>
    </section>
  );
}
