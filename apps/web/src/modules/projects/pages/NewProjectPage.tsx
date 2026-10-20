import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Flower2, Leaf, Code2, Compass } from 'lucide-react';
import { useDemo } from '../../../app/providers/DemoProvider';
import { demoTemplates, makeProject } from '../data/demo-projects';
import type { Project } from '../model/project';

const icons = [Flower2, Leaf, Code2, Compass];
export function NewProjectPage() {
  const { addProject, notify, setPersona } = useDemo();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('maya.patel@example.com');
  const [route, setRoute] = useState<Project['route']>('in-platform');
  const chosen = demoTemplates[template]!;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const project = makeProject(title.trim(), description.trim(), template, route, email);
    addProject(project);
    setPersona('author');
    notify('Your demo project is ready. No invitation email was sent.');
    navigate(`/projects/${project.id}`);
  }
  return (
    <>
      <Link to="/projects" className="back-link">
        <ArrowLeft size={15} />
        Back to projects
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A NEW CHAPTER</p>
          <h1>Give your idea a place to grow.</h1>
          <p>Create a demo project as its Author. You can shape the details as you go.</p>
        </div>
        <span className="step-indicator">STEP {step} OF 2</span>
      </div>
      <div className="creation-layout">
        <div>
          <div className="step-tabs">
            <span className={step === 1 ? 'active' : ''}>
              <b>{step === 2 ? <Check size={12} /> : '1'}</b>Choose a starting point
            </span>
            <i />
            <span className={step === 2 ? 'active' : ''}>
              <b>2</b>Make it yours
            </span>
          </div>
          {step === 1 ? (
            <>
              <h2 className="form-section-title">What kind of project are you working on?</h2>
              <p className="muted">
                Illustrative templates for this prototype. Each gives your process a simple
                structure.
              </p>
              <div className="template-grid">
                {demoTemplates.map((item, index) => {
                  const Icon = icons[index]!;
                  return (
                    <button
                      className={`template-card ${template === index ? 'chosen' : ''}`}
                      key={item.name}
                      onClick={() => setTemplate(index)}
                      aria-pressed={template === index}
                    >
                      <span className={`project-icon ${item.color}`}>
                        <Icon size={24} />
                      </span>
                      <strong>{item.name}</strong>
                      <p>{item.description}</p>
                      <span className="template-count">{item.milestones.length} milestones</span>
                      {template === index && (
                        <span className="chosen-check">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="form-actions">
                <button className="button primary" onClick={() => setStep(2)}>
                  Continue with this template
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="panel form-panel">
              <label>
                Project title
                <input
                  required
                  maxLength={120}
                  autoFocus
                  placeholder="A name for what you’re exploring"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                A little about your project
                <textarea
                  required
                  maxLength={600}
                  rows={3}
                  placeholder="What are you hoping to explore, make, or understand?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label>
                Main Reviewer’s email
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <small>
                  Demo only. An invitation will appear in your team view; no email is sent.
                </small>
              </label>
              <fieldset>
                <legend>How will your project be approved?</legend>
                <label className="radio-card">
                  <input
                    type="radio"
                    checked={route === 'in-platform'}
                    onChange={() => setRoute('in-platform')}
                    name="route"
                  />
                  <span>
                    <strong>Proposal in Trace</strong>
                    <small>Your Reviewer approves the proposal before work begins.</small>
                  </span>
                </label>
                <label className="radio-card">
                  <input
                    type="radio"
                    checked={route === 'external'}
                    onChange={() => setRoute('external')}
                    name="route"
                  />
                  <span>
                    <strong>Already approved elsewhere</strong>
                    <small>The project activates when your Reviewer joins.</small>
                  </span>
                </label>
              </fieldset>
              <div className="form-actions">
                <button type="button" className="button secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="button primary" type="submit">
                  Create demo project
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}
        </div>
        <aside className="panel template-preview">
          <p className="eyebrow">YOUR STARTING STRUCTURE</p>
          <h2>{chosen.name}</h2>
          <ol>
            {chosen.milestones.map((name, i) => (
              <li key={name}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                {name}
              </li>
            ))}
          </ol>
          <div className="soft-note">A thoughtful structure, with room to make it your own.</div>
        </aside>
      </div>
    </>
  );
}
