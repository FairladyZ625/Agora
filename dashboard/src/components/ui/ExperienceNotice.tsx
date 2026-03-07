import { useEffect } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useFeedbackStore } from '@/stores/feedbackStore';

const toneMap = {
  info: {
    icon: Info,
    className: 'experience-notice experience-notice--info',
  },
  success: {
    icon: CheckCircle2,
    className: 'experience-notice experience-notice--success',
  },
  warning: {
    icon: TriangleAlert,
    className: 'experience-notice experience-notice--warning',
  },
} as const;

export function ExperienceNotice() {
  const { message, clearMessage } = useFeedbackStore();

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => clearMessage(), 3400);
    return () => window.clearTimeout(timeout);
  }, [message, clearMessage]);

  if (!message) return null;

  const tone = toneMap[message.tone];
  const Icon = tone.icon;

  return (
    <div className={tone.className} role="status" aria-live="polite">
      <div className="experience-notice__icon">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="experience-notice__title">{message.title}</p>
        <p className="experience-notice__detail">{message.detail}</p>
      </div>
      <button
        type="button"
        className="icon-button experience-notice__close"
        onClick={clearMessage}
        aria-label="关闭提示"
      >
        <X size={14} />
      </button>
    </div>
  );
}
