import { Routes, Route, Navigate } from 'react-router';
import { AppShell } from '@/components/layouts/AppShell';
import { DashboardHome } from '@/pages/DashboardHome';
import { TasksPage } from '@/pages/TasksPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
