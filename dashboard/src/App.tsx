import '@/lib/i18n';
import { useEffect } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router';
import { AppShell } from '@/components/layouts/AppShell';
import { ProjectWorkspaceShell } from '@/components/layouts/ProjectWorkspaceShell';
import { PageTransition } from '@/components/ui/PageTransition';
import { DashboardHome } from '@/pages/DashboardHome';
import { BoardPage } from '@/pages/BoardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { ProjectDetailPage } from '@/pages/ProjectDetailPage';
import { ProjectBrainPage } from '@/pages/ProjectBrainPage';
import { ProjectCurrentWorkPage } from '@/pages/ProjectCurrentWorkPage';
import { ProjectWorkspacePlaceholderPage } from '@/pages/ProjectWorkspacePlaceholderPage';
import { WorkspaceBootstrapPage } from '@/pages/WorkspaceBootstrapPage';
import { LegacyTasksRedirectPage } from '@/pages/LegacyTasksRedirectPage';
import { CreateTaskPage } from '@/pages/CreateTaskPage';
import { AgentsPage } from '@/pages/AgentsPage';
import { ExternalBridgesPage } from '@/pages/ExternalBridgesPage';
import { TodosPage } from '@/pages/TodosPage';
import { ArchivePage } from '@/pages/ArchivePage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { TemplateGraphEditorPage } from '@/pages/TemplateGraphEditorPage';
import { ReviewsPage } from '@/pages/ReviewsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LoginPage } from '@/pages/LoginPage';
import { RequireSession } from '@/components/auth/RequireSession';
import { useSessionStore } from '@/stores/sessionStore';

function ProtectedAppLayout() {
  return (
    <RequireSession>
      <AppShell>
        <PageTransition>
          <Outlet />
        </PageTransition>
      </AppShell>
    </RequireSession>
  );
}

export default function App() {
  const status = useSessionStore((state) => state.status);
  const refresh = useSessionStore((state) => state.refresh);

  useEffect(() => {
    if (status === 'idle') {
      void refresh();
    }
  }, [refresh, status]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedAppLayout />}>
        <Route path="/" element={<DashboardHome />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/workspace/bootstrap" element={<WorkspaceBootstrapPage />} />
        <Route path="/projects/:projectId" element={<ProjectWorkspaceShell />}>
          <Route index element={<ProjectDetailPage />} />
          <Route path="work" element={<ProjectCurrentWorkPage />} />
          <Route path="work/:taskId" element={<ProjectCurrentWorkPage />} />
          <Route path="brain" element={<ProjectBrainPage />} />
          <Route
            path="knowledge"
            element={
              <ProjectWorkspacePlaceholderPage
                title="Knowledge"
                summary="Project-scoped durable knowledge surface will move here."
              />
            }
          />
          <Route
            path="archive"
            element={
              <ProjectWorkspacePlaceholderPage
                title="Archive"
                summary="Project-scoped archive surface will be aligned after shell cutover."
              />
            }
          />
          <Route
            path="operator"
            element={
              <ProjectWorkspacePlaceholderPage
                title="Operator"
                summary="Project-scoped operator controls will move here."
              />
            }
          />
        </Route>
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/bridges" element={<ExternalBridgesPage />} />
        <Route path="/todos" element={<TodosPage />} />
        <Route path="/archive" element={<ArchivePage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:templateId/graph" element={<TemplateGraphEditorPage />} />
        <Route path="/tasks/new" element={<CreateTaskPage />} />
        <Route path="/tasks" element={<LegacyTasksRedirectPage />} />
        <Route path="/tasks/:taskId" element={<LegacyTasksRedirectPage />} />
        <Route path="/reviews" element={<ReviewsPage />} />
        <Route path="/reviews/:reviewId" element={<ReviewsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
