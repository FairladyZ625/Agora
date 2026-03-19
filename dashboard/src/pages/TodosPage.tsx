import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTodosPageCopy } from '@/lib/dashboardCopy';
import { useFeedbackStore } from '@/stores/feedbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTodoStore } from '@/stores/todoStore';
import type { TodoFilter } from '@/types/dashboard';

export function TodosPage() {
  const location = useLocation();
  const { t } = useTranslation();
  const copy = useTodosPageCopy();
  const todos = useTodoStore((state) => state.todos);
  const filter = useTodoStore((state) => state.filter);
  const error = useTodoStore((state) => state.error);
  const fetchTodos = useTodoStore((state) => state.fetchTodos);
  const createTodo = useTodoStore((state) => state.createTodo);
  const updateTodo = useTodoStore((state) => state.updateTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const promoteTodo = useTodoStore((state) => state.promoteTodo);
  const setFilter = useTodoStore((state) => state.setFilter);
  const projectFilter = useTodoStore((state) => state.projectFilter);
  const setProjectFilter = useTodoStore((state) => state.setProjectFilter);
  const projects = useProjectStore((state) => state.projects);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const { showMessage } = useFeedbackStore();
  const [text, setText] = useState('');
  const [projectIdOverride, setProjectIdOverride] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    void fetchTodos();
    void fetchProjects();
  }, [fetchProjects, fetchTodos, filter, projectFilter]);

  const presetProjectId = new URLSearchParams(location.search).get('project') ?? '';
  const projectId = projectIdOverride ?? presetProjectId;

  const submitTodo = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) return;
    try {
      await createTodo({
        text: text.trim(),
        project_id: projectId || null,
        due: due || null,
        tags: tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setText('');
      setProjectIdOverride(null);
      setDue('');
      setTags('');
    } catch (todoError) {
      showMessage(
        t('feedback.taskActionFailureTitle'),
        todoError instanceof Error ? todoError.message : String(todoError),
        'warning',
      );
    }
  };

  const filterOptions: TodoFilter[] = ['all', 'pending', 'done'];

  return (
    <div className="space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="workbench-masthead">
          <div>
            <p className="page-kicker">{copy.kicker}</p>
            <h2 className="page-title">{copy.title}</h2>
            <p className="page-summary">{copy.summary}</p>
          </div>
          <div className="workbench-masthead__signals">
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.filters.all}</span>
              <span className="inline-stat__value">{todos.length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.filters.pending}</span>
              <span className="inline-stat__value">{todos.filter((todo) => todo.status === 'pending').length}</span>
            </div>
            <div className="inline-stat">
              <span className="inline-stat__label">{copy.filters.done}</span>
              <span className="inline-stat__value">{todos.filter((todo) => todo.status === 'done').length}</span>
            </div>
          </div>
        </div>
        {error ? <div className="inline-alert inline-alert--danger mt-5">{error}</div> : null}
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="todos-composer-panel">
        <form className="grid gap-4 lg:grid-cols-4" onSubmit={submitTodo}>
          <label className="space-y-2 lg:col-span-2">
            <span className="field-label">{copy.inputLabel}</span>
            <input
              type="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="input-shell"
              placeholder={copy.inputPlaceholder}
            />
          </label>
          <label className="space-y-2">
            <span className="field-label">{copy.projectLabel}</span>
            <select
              aria-label={copy.projectLabel}
              value={projectId}
              onChange={(event) => setProjectIdOverride(event.target.value)}
              className="input-shell"
            >
              <option value="">{copy.noProjectOption}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="field-label">{copy.dueLabel}</span>
            <input
              type="date"
              value={due}
              onChange={(event) => setDue(event.target.value)}
              className="input-shell"
            />
          </label>
          <label className="space-y-2">
            <span className="field-label">{copy.tagsLabel}</span>
            <input
              type="text"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              className="input-shell"
              placeholder={copy.tagsPlaceholder}
            />
          </label>
          <div className="lg:col-span-4">
            <button type="submit" className="button-primary">
              {copy.createAction}
            </button>
          </div>
        </form>
      </section>

      <section className="surface-panel surface-panel--workspace" data-testid="todos-queue-panel">
        <div className="mb-5 flex flex-wrap gap-2">
          {filterOptions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={filter === item ? 'choice-pill choice-pill--active' : 'choice-pill'}
            >
              {copy.filters[item]}
            </button>
          ))}
          <select
            aria-label={copy.projectFilterLabel}
            value={projectFilter ?? ''}
            onChange={(event) => setProjectFilter(event.target.value || null)}
            className="input-shell max-w-xs"
          >
            <option value="">{copy.allProjectsOption}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {todos.length === 0 ? (
            <div className="empty-state">
              <p className="type-body-sm">{copy.emptyTitle}</p>
            </div>
          ) : (
            todos.map((todo) => (
              <div key={todo.id} className="data-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="type-heading-sm">{todo.text}</strong>
                    <span className="status-pill status-pill--neutral">{todo.status}</span>
                  </div>
                  <div className="type-text-xs mt-3 flex flex-wrap items-center gap-3">
                    {todo.projectId ? <span>{projects.find((project) => project.id === todo.projectId)?.name ?? todo.projectId}</span> : null}
                    {todo.due ? <span>{todo.due}</span> : null}
                    <span>{todo.tagLabel}</span>
                    {todo.promotedTo ? <span>{copy.promotedPrefix} {todo.promotedTo}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void updateTodo(todo.id, { status: todo.status === 'done' ? 'pending' : 'done' })}
                  >
                    {todo.status === 'done' ? copy.reopenAction : copy.doneAction}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void promoteTodo(todo.id, { type: 'quick', creator: 'archon', priority: 'normal' })}
                    disabled={Boolean(todo.promotedTo)}
                  >
                    {copy.promoteAction}
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => void deleteTodo(todo.id)}
                  >
                    {copy.deleteAction}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
