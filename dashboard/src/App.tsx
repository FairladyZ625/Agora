import '@/lib/i18n';
import { Routes, Route, Navigate } from 'react-router';
import { AppShell } from '@/components/layouts/AppShell';
import { PageTransition } from '@/components/ui/PageTransition';
import { DashboardHome } from '@/pages/DashboardHome';
import { BoardPage } from '@/pages/BoardPage';
import { TasksPage } from '@/pages/TasksPage';
import { CreateTaskPage } from '@/pages/CreateTaskPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { TodosPage } from '@/pages/TodosPage';
import { ArchivePage } from '@/pages/ArchivePage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  return (
    <AppShell>
      <PageTransition>
        <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/todos" element={<TodosPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/tasks/new" element={<CreateTaskPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:taskId" element={<TasksPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:reviewId" element={<ReviewsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </PageTransition>
    </AppShell>
  );
}
