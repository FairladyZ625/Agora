import '@/lib/i18n';
import { Routes, Route, Navigate } from 'react-router';
import { AppShell } from '@/components/layouts/AppShell';
import { DashboardHome } from '@/pages/DashboardHome';
import { BoardPage } from '@/pages/BoardPage';
import { TasksPage } from '@/pages/TasksPage';
import { CreateTaskPage } from '@/pages/CreateTaskPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/tasks/new" element={<CreateTaskPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:taskId" element={<TasksPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:reviewId" element={<ReviewsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
