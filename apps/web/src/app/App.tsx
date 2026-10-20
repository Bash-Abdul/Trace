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
export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
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
