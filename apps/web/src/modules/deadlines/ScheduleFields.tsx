import { HelpHint } from '../../shared/ui/HelpHint';
const timezones = ['UTC', ...Intl.supportedValuesOf('timeZone')];
export function ScheduleFields({
  dueDate,
  timezone,
  disabled = false,
}: {
  dueDate?: string | null | undefined;
  timezone?: string | null | undefined;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="structure-editor">
      <legend>
        Optional schedule{' '}
        <HelpHint label="Optional due dates">
          Leave dates blank for no deadline. Dates last through the end of the day in the project
          timezone. Due soon means the next seven days. Overdue is informational and never blocks a
          submission or changes a review decision.
        </HelpHint>
      </legend>
      <label>
        Project due date (optional)
        <input type="date" name="dueDate" defaultValue={dueDate ?? ''} />
      </label>
      <label>
        Project timezone
        <input
          name="timezone"
          list="project-timezones"
          defaultValue={timezone ?? ''}
          maxLength={100}
          placeholder="Choose a timezone before adding dates"
        />
      </label>
      <datalist id="project-timezones">
        {timezones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      <p className="muted">
        All project and milestone dates use this timezone. Clear a date to remove its deadline.
      </p>
    </fieldset>
  );
}
