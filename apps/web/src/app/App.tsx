import { ReviewQueuePage } from '../modules/reviews/ReviewQueuePage';
import type { ReactNode } from 'react';
import { LiveMilestonePage } from '../modules/milestones/LiveMilestonePage';
import { Route, Routes, Link, Navigate, useLocation } from 'react-router-dom';
import { WorkspaceViewProvider } from './providers/WorkspaceViewProvider';
import { DemoProjectsPage } from '../modules/projects/pages/DemoProjectsPage';
import { NewProjectPage } from '../modules/projects/pages/NewProjectPage';
import { ProjectPage } from '../modules/projects/pages/ProjectPage';
import { MilestonePage } from '../modules/submissions/MilestonePage';
import { PortfolioIndex, PortfolioPage } from '../modules/portfolio/PortfolioPage';
import { ActivityPage } from '../modules/activity/ActivityList';
import { SettingsPage } from '../modules/settings/SettingsPage';
import { ReviewsPage } from '../modules/feedback/FeedbackPanel';
import { LandingPage } from '../modules/landing/LandingPage';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from '../modules/dashboard/DashboardPage';
import { ProjectsPage } from '../modules/projects/pages/ProjectsPage';
import { EmptyState } from '../shared/ui/Primitives';
import { AuthLayout, RequireAuth } from '../modules/auth/components/AuthLayout';
import { CredentialsPage } from '../modules/auth/pages/CredentialsPage';
import { EmailRequestPage } from '../modules/auth/pages/EmailRequestPage';
import { ActionTokenPage } from '../modules/auth/pages/ActionTokenPage';
import { AccountPage } from '../modules/auth/pages/AccountPage';
import { WorkspaceProvider } from '../modules/workspace/WorkspaceLayout';
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
          <Route path="workspace/*" element={<LegacyWorkspaceRedirect />} />
          <Route
            element={
              <WorkspaceViewProvider>
                <AppShell />
              </WorkspaceViewProvider>
            }
          >
            <Route path="overview" element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/new" element={<CreateProjectPage />} />
            <Route path="projects/:projectId" element={<LiveProjectPage />} />
            <Route
              path="projects/:projectId/milestones/:milestoneId"
              element={<LiveMilestonePage />}
            />
            <Route path="reviews" element={<ReviewQueuePage />} />
            <Route
              path="demo/reviews"
              element={
                <DemoPreview>
                  <ReviewsPage />
                </DemoPreview>
              }
            />
            <Route
              path="settings"
              element={
                <DemoPreview>
                  <SettingsPage />
                </DemoPreview>
              }
            />
            <Route
              path="activity"
              element={
                <DemoPreview>
                  <ActivityPage />
                </DemoPreview>
              }
            />
            <Route
              path="portfolio"
              element={
                <DemoPreview>
                  <PortfolioIndex />
                </DemoPreview>
              }
            />
            <Route
              path="projects/:projectId/portfolio"
              element={
                <DemoPreview>
                  <PortfolioIndex />
                </DemoPreview>
              }
            />
            <Route
              path="demo/projects"
              element={
                <DemoPreview>
                  <DemoProjectsPage />
                </DemoPreview>
              }
            />
            <Route
              path="demo/projects/new"
              element={
                <DemoPreview>
                  <NewProjectPage />
                </DemoPreview>
              }
            />
            <Route
              path="demo/projects/:projectId"
              element={
                <DemoPreview>
                  <ProjectPage />
                </DemoPreview>
              }
            />
            <Route
              path="demo/projects/:projectId/milestones/:milestoneId"
              element={
                <DemoPreview>
                  <MilestonePage />
                </DemoPreview>
              }
            />
            <Route
              path="demo/projects/:projectId/portfolio"
              element={
                <DemoPreview>
                  <PortfolioPage />
                </DemoPreview>
              }
            />
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
        </Route>
      </Route>
    </Routes>
  );
}

function LegacyWorkspaceRedirect() {
  const { pathname, search, hash } = useLocation();
  const target =
    pathname === '/workspace' || pathname === '/workspace/'
      ? '/projects'
      : pathname === '/workspace/new'
        ? '/projects/new'
        : pathname.replace(/^\/workspace/, '');
  return <Navigate to={`${target}${search}${hash}`} replace />;
}
function DemoPreview({ children }: { children: ReactNode }) {
  return (
    <section className="demo-preview">
      <p className="soft-note">
        <strong>Demo preview</strong> · Fictional records for features still being connected.
        Actions here only update this browser.
      </p>
      {children}
    </section>
  );
}
