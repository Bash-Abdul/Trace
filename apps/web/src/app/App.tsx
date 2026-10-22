import { LiveMilestonePage } from '../modules/milestones/LiveMilestonePage';
import { Route, Routes, Link } from 'react-router-dom';
import { LandingPage } from '../modules/landing/LandingPage';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from '../modules/dashboard/DashboardPage';
import { ProjectsPage } from '../modules/projects/pages/ProjectsPage';
import { NewProjectPage } from '../modules/projects/pages/NewProjectPage';
import { ProjectPage } from '../modules/projects/pages/ProjectPage';
import { MilestonePage } from '../modules/submissions/MilestonePage';
import { ReviewsPage } from '../modules/feedback/FeedbackPanel';
import { ActivityPage } from '../modules/activity/ActivityList';
import { PortfolioIndex, PortfolioPage } from '../modules/portfolio/PortfolioPage';
import { SettingsPage } from '../modules/settings/SettingsPage';
import { EmptyState } from '../shared/ui/Primitives';
import { AuthLayout, RequireAuth } from '../modules/auth/components/AuthLayout';
import { CredentialsPage } from '../modules/auth/pages/CredentialsPage';
import { EmailRequestPage } from '../modules/auth/pages/EmailRequestPage';
import { ActionTokenPage } from '../modules/auth/pages/ActionTokenPage';
import { AccountPage } from '../modules/auth/pages/AccountPage';
import { WorkspaceProvider, WorkspaceLayout } from '../modules/workspace/WorkspaceLayout';
import { WorkspacePage } from '../modules/workspace/WorkspacePage';
import { CreateProjectPage } from '../modules/workspace/CreateProjectPage';
import { LiveProjectPage } from '../modules/workspace/LiveProjectPage';
import { AcceptInvitationPage } from '../modules/workspace/AcceptInvitationPage';
export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AuthLayout />}>
        <Route path="invitations/accept" element={<AcceptInvitationPage />} />
        <Route path="login" element={<CredentialsPage key="login" />} />
        <Route path="register" element={<CredentialsPage key="register" register />} />
        <Route path="forgot-password" element={<EmailRequestPage key="forgot" />} />
        <Route
          path="resend-verification"
          element={<EmailRequestPage key="resend" verification />}
        />
        <Route path="verify-email" element={<ActionTokenPage key="verify" />} />
        <Route path="reset-password" element={<ActionTokenPage key="reset" reset />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route element={<WorkspaceProvider />}>
        <Route element={<RequireAuth />}>
          <Route path="workspace" element={<WorkspaceLayout />}>
            <Route index element={<WorkspacePage />} />
            <Route path="new" element={<CreateProjectPage />} />
            <Route path="projects/:projectId" element={<LiveProjectPage />} />
            <Route
              path="projects/:projectId/milestones/:milestoneId"
              element={<LiveMilestonePage />}
            />
          </Route>
        </Route>
      </Route>
      <Route element={<AppShell />}>
        <Route path="overview" element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/new" element={<NewProjectPage />} />
        <Route path="projects/:projectId" element={<ProjectPage />} />
        <Route path="projects/:projectId/milestones/:milestoneId" element={<MilestonePage />} />
        <Route path="projects/:projectId/portfolio" element={<PortfolioPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="portfolio" element={<PortfolioIndex />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="*"
          element={
            <EmptyState
              title="This page hasn’t taken shape yet"
              description="Let’s head back to your workspace."
            >
              <Link className="button primary" to="/overview">
                Back to overview
              </Link>
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  );
}
