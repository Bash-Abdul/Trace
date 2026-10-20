import { useState } from 'react';
import { RotateCcw, Monitor } from 'lucide-react';
import { useDemo } from '../../app/providers/DemoProvider';
import { Modal } from '../../shared/ui/Primitives';
export function SettingsPage() {
  const { reset, storageAvailable } = useDemo();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Your demo workspace.</h1>
          <p>A safe place to explore how Trace could feel.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <Monitor size={24} />
        <h2>Local, fictional, yours to explore.</h2>
        <p>
          This prototype uses dummy data stored in this browser. The Author / Reviewer selector lets
          you explore both sides of a project.
        </p>
        <p>
          {storageAvailable
            ? 'Your demo changes persist when you refresh this browser.'
            : 'Browser storage is unavailable. Changes will last only for this visit.'}
        </p>
        <p>
          No backend connection, real invitations, file uploads, or authentication are enabled here.
          Your existing backend is separate.
        </p>
        <hr />
        <h3>Start the demo again</h3>
        <p>
          Restore the three original fictional projects. This replaces only this prototype’s browser
          data.
        </p>
        <button className="button secondary" onClick={() => setConfirm(true)}>
          <RotateCcw size={16} />
          Reset demo data
        </button>
      </section>
      {confirm && (
        <Modal title="Restore the original demo?" onClose={() => setConfirm(false)}>
          <div className="modal-body">
            <p>
              Your changes to the fictional projects in this browser will be replaced with the
              original examples.
            </p>
            <div className="form-actions">
              <button className="button secondary" onClick={() => setConfirm(false)}>
                Keep my changes
              </button>
              <button
                className="button primary"
                onClick={() => {
                  reset();
                  setConfirm(false);
                }}
              >
                Restore demo
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
