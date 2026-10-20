import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { DemoProvider } from './app/providers/DemoProvider';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/newsreader/400.css';
import './app/styles.css';
import './app/layout/layout.css';
import './shared/ui/ui.css';
import './modules/dashboard/dashboard.css';
import './modules/projects/projects.css';
import './modules/portfolio/portfolio.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty-state">
        <h1>Something interrupted the demo.</h1>
        <p>Reload to return to your saved workspace.</p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <DemoProvider>
          <App />
        </DemoProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

import './modules/submissions/submissions.css';
import './modules/feedback/feedback.css';
import './modules/activity/activity.css';
import './modules/settings/settings.css';
