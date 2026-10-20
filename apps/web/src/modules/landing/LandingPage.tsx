import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  FileText,
  Flower2,
  GitBranch,
  MessageSquare,
  Sprout,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './landing.css';
import { useLandingMotion } from './useLandingMotion';

const steps = [
  {
    number: '01',
    title: 'Give your project a starting point.',
    description:
      'Bring your objectives, milestones, and Reviewer together. Begin with a shared understanding of what you’re working towards.',
    icon: Sprout,
  },
  {
    number: '02',
    title: 'Keep a trace as you go.',
    description:
      'Connect your evidence to your milestones. Share the thinking behind the work, receive feedback, and make room for the next version.',
    icon: GitBranch,
  },
  {
    number: '03',
    title: 'Tell the whole story.',
    description:
      'Bring your evidence, reflections, and decisions into a process portfolio that shows how your final outcome came to be.',
    icon: FileText,
  },
];
function Brand() {
  return (
    <Link to="/" className="brand landing-brand" aria-label="Trace home">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      trace<span className="brand-period">.</span>
    </Link>
  );
}
function ProjectPreview() {
  return (
    <div
      className="landing-preview"
      aria-label="Example Trace project with two approved milestones and reviewer feedback"
    >
      <div className="preview-window-bar">
        <span className="window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>YOUR PROJECT, COMING TOGETHER</span>
        <span className="preview-demo-label">Sample workspace</span>
      </div>
      <div className="preview-body">
        <div className="preview-project-heading">
          <span className="preview-flower">
            <Flower2 size={26} strokeWidth={1.4} />
          </span>
          <span className="preview-state">
            <span />
            In progress
          </span>
        </div>
        <p className="eyebrow">DESIGN PROJECT / TR–024</p>
        <h2>Designing a calmer campus</h2>
        <p className="preview-description">
          A thoughtful exploration of space, belonging, and student wellbeing.
        </p>
        <div className="preview-people">
          <span className="avatar avatar-small">BA</span>
          <span className="avatar avatar-small avatar-maya">MP</span>
          <span>One shared direction.</span>
        </div>
        <div className="preview-progress">
          <span>Milestones approved</span>
          <strong>
            2 <span>/ 6</span>
          </strong>
        </div>
        <div className="preview-segments">
          {Array.from({ length: 6 }, (_, i) => (
            <span className={i < 2 ? 'done' : ''} key={i} />
          ))}
        </div>
        <div className="preview-milestones">
          {[
            'Project brief & proposal',
            'Context & literature review',
            'User research & insights',
          ].map((title, i) => (
            <div key={title}>
              <span className={`preview-check ${i === 2 ? 'pending' : ''}`}>
                {i < 2 ? <Check size={13} /> : <MessageSquare size={12} />}
              </span>
              <span>{title}</span>
              <small>{i < 2 ? 'Approved' : 'In conversation'}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="preview-feedback">
        <span className="avatar avatar-maya">MP</span>
        <div>
          <strong>A little feedback. A new direction.</strong>
          <p>
            “A thoughtful set of interviews. Let’s connect these findings to your design
            opportunities.”
          </p>
          <span>Dr. Maya Patel · Main Reviewer</span>
        </div>
      </div>
      <div className="preview-note">
        <CheckCheck size={16} />
        <span>Small steps. A meaningful record.</span>
      </div>
    </div>
  );
}
export function LandingPage() {
  const motionRef = useLandingMotion();
  return (
    <div className="landing-page" ref={motionRef}>
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>
      <header className="landing-nav landing-container">
        <Brand />
        <nav aria-label="Public navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#built-for">Who it’s for</a>
          <a href="#portfolio">The portfolio</a>
        </nav>
        <Link className="button primary" to="/overview">
          Explore the demo
          <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="landing-main">
        <section className="landing-hero landing-container">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span />
              FOR THE WORK BEHIND THE WORK
            </p>
            <h1>
              Good work has
              <br />a story.
              <br />
              <em>Keep a trace.</em>
            </h1>
            <p className="landing-lead">
              A calmer home for long-running projects. Bring your milestones, evidence, and feedback
              together — and make the journey as visible as the outcome.
            </p>
            <div className="landing-hero-actions">
              <Link className="button primary" to="/overview">
                Step inside Trace
                <ArrowRight size={17} />
              </Link>
              <a className="landing-secondary" href="#how-it-works">
                See how it works<span>↓</span>
              </a>
            </div>
            <p className="landing-demo-note">Explore with sample projects. No account needed.</p>
            <div className="landing-hero-caption">
              <span className="caption-line" />
              <span>
                Less scattered work.
                <br />
                More room to think.
              </span>
            </div>
          </div>
          <div className="landing-hero-visual">
            <span className="landing-visual-caption">A LITTLE PROGRESS, EVERY DAY.</span>
            <ProjectPreview />
            <span className="landing-visual-footnote">
              An idea becomes a process. A process becomes a story.
            </span>
          </div>
        </section>
        <div className="landing-principles">
          <div className="landing-container">
            <span>THOUGHTFUL WORK TAKES TIME.</span>
            <p>A shared starting point.</p>
            <span className="principle-dot">✳</span>
            <p>Space for revision.</p>
            <span className="principle-dot">✳</span>
            <p>A record that stays together.</p>
          </div>
        </div>
        <section id="how-it-works" className="landing-section landing-container">
          <div className="landing-section-heading">
            <div>
              <p className="eyebrow">FROM THE FIRST QUESTION TO THE FINAL OUTCOME</p>
              <h2>
                A little structure.
                <br />A lot of room to grow.
              </h2>
            </div>
            <p>
              Your work might happen in a notebook, a studio, or a code editor. Trace gives the
              process a place to come together.
            </p>
          </div>
          <div className="landing-steps">
            {steps.map(({ number, title, description, icon: Icon }) => (
              <article key={number}>
                <div className="landing-step-top">
                  <Icon size={25} strokeWidth={1.4} />
                  <span>{number}</span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="built-for" className="landing-people-section">
          <div className="landing-container landing-people-grid">
            <div>
              <p className="eyebrow">A SHARED SPACE. TWO PERSPECTIVES.</p>
              <h2>
                Independent work.
                <br />
                Connected people.
              </h2>
              <p>
                For assessed projects that develop over weeks and months, with thoughtful guidance
                along the way.
              </p>
              <div className="landing-project-types">
                <span>Dissertations</span>
                <span>Design projects</span>
                <span>Software projects</span>
                <span>Independent study</span>
              </div>
            </div>
            <div className="landing-role-cards">
              <article>
                <span className="landing-role-label">FOR THE AUTHOR</span>
                <h3>Make your thinking visible.</h3>
                <p>
                  Gather evidence, explain your decisions, and turn feedback into your next step.
                  Your process deserves more than a final submission.
                </p>
                <span className="role-card-bottom">
                  <GitBranch size={16} />
                  Every version is part of the story.
                </span>
              </article>
              <article>
                <span className="landing-role-label">FOR THE REVIEWER</span>
                <h3>See the work taking shape.</h3>
                <p>
                  Follow milestones, offer focused feedback, and review the evidence in context.
                  Keep the conversation connected to the work.
                </p>
                <span className="role-card-bottom">
                  <MessageSquare size={16} />A shared direction, at every milestone.
                </span>
              </article>
            </div>
          </div>
        </section>
        <section id="portfolio" className="landing-container landing-portfolio-section">
          <div className="landing-portfolio-art" aria-label="Illustration of a process portfolio">
            <div className="landing-paper-shadow" />
            <div className="landing-paper">
              <span className="paper-wordmark">trace.</span>
              <span className="eyebrow">PROCESS PORTFOLIO / TR–024</span>
              <h3>
                Designing
                <br />a calmer
                <br />
                campus.
              </h3>
              <span className="paper-rule" />
              <p>THE QUESTION. THE PROCESS. THE OUTCOME.</p>
              <div className="paper-timeline">
                <span>
                  <i />
                  Intent & objectives
                </span>
                <span>
                  <i />
                  Evidence & exploration
                </span>
                <span>
                  <i />
                  Feedback & reflection
                </span>
                <span>
                  <i />
                  The final outcome
                </span>
              </div>
              <footer>
                BASHIR ABDUL <span>DESIGN PROJECT</span>
              </footer>
            </div>
            <span className="landing-paper-stamp">
              <CheckCheck size={25} />
              <span>
                BUILT ALONG
                <br />
                THE WAY
              </span>
            </span>
          </div>
          <div className="landing-portfolio-copy">
            <p className="eyebrow">MORE THAN THE FINISHED THING</p>
            <h2>
              The journey is
              <br />
              part of the work.
            </h2>
            <p>
              Your evidence, reflections, and review decisions come together in a printable process
              portfolio. A living record as you work. A complete story when you finish.
            </p>
            <ul>
              <li>
                <Check size={16} />
                Evidence connected to each milestone
              </li>
              <li>
                <Check size={16} />
                Revisions and feedback kept in context
              </li>
              <li>
                <Check size={16} />A clear record of how the outcome developed
              </li>
            </ul>
            <Link className="landing-secondary" to="/projects/calmer-campus/portfolio">
              Explore a sample portfolio
              <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
        <section className="landing-closing landing-container">
          <Sprout size={29} strokeWidth={1.3} />
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS WITH A SMALL STEP</p>
          <h2>Make space for your process.</h2>
          <p>Take a look around. There’s a project waiting for you.</p>
          <Link className="button primary" to="/overview">
            Explore the demo workspace
            <ArrowRight size={17} />
          </Link>
          <small>Fictional projects. Real room to explore.</small>
        </section>
      </main>
      <footer className="landing-footer landing-container">
        <div>
          <Brand />
          <p>Made for the work behind the work.</p>
        </div>
        <a href="#how-it-works">How it works</a>
        <Link to="/overview">
          Open workspace
          <ArrowUpRight size={14} />
        </Link>
        <span>Trace · Product preview</span>
      </footer>
    </div>
  );
}
