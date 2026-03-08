import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getPriorityMeta } from '@/lib/taskMeta';
import { useCreateTaskPageCopy } from '@/lib/dashboardCopy';
import { useTaskStore } from '@/stores/taskStore';
import { useFeedbackStore } from '@/stores/feedbackStore';

export function CreateTaskPage() {
  const { t } = useTranslation();
  const createTaskCopy = useCreateTaskPageCopy();
  const createTask = useTaskStore((state) => state.createTask);
  const { showMessage } = useFeedbackStore();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof createTaskCopy.taskTypes)[number]['value']>('coding');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [submitting, setSubmitting] = useState(false);
  const priorities = ['low', 'normal', 'high'] as const;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const task = await createTask({
        title: title.trim(),
        type,
        creator: 'archon',
        description: description.trim(),
        priority,
      });
      showMessage(
        t('feedback.taskCreatedTitle'),
        t('feedback.taskCreatedDetail', { id: task.id }),
        'success',
      );
      navigate(`/tasks/${task.id}`);
    } catch (error) {
      showMessage(
        t('feedback.taskCreateFailureTitle'),
        error instanceof Error ? error.message : String(error),
        'warning',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-enter space-y-6">
      <section className="surface-panel surface-panel--workspace">
        <div className="section-title-row">
          <div>
            <p className="page-kicker">{createTaskCopy.kicker}</p>
            <h2 className="page-title">{createTaskCopy.title}</h2>
            <p className="page-summary">{createTaskCopy.summary}</p>
          </div>
        </div>
      </section>

      <section className="surface-panel surface-panel--workspace">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="space-y-2">
            <span className="field-label">{createTaskCopy.titleLabel}</span>
            <input
              aria-label={createTaskCopy.titleLabel}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="input-shell"
              placeholder={createTaskCopy.titlePlaceholder}
            />
          </label>

          <label className="space-y-2">
            <span className="field-label">{createTaskCopy.descriptionLabel}</span>
            <textarea
              aria-label={createTaskCopy.descriptionLabel}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="textarea-shell"
              placeholder={createTaskCopy.descriptionPlaceholder}
            />
          </label>

          <div>
            <span className="field-label">{createTaskCopy.typeLabel}</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {createTaskCopy.taskTypes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setType(item.value)}
                  className={type === item.value ? 'choice-pill choice-pill--active' : 'choice-pill'}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="field-label">{createTaskCopy.priorityLabel}</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {priorities.map((value) => {
                const meta = getPriorityMeta(value);
                return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={priority === value ? 'choice-pill choice-pill--active' : 'choice-pill'}
                >
                  {meta.label}
                </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="button-primary" disabled={submitting || title.trim().length === 0}>
              {submitting ? createTaskCopy.submittingAction : createTaskCopy.submitAction}
            </button>
            <button type="button" className="button-secondary" onClick={() => navigate('/board')}>
              {createTaskCopy.backAction}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
