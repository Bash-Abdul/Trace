import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
export function PasswordField({
  value,
  onChange,
  label = 'Password',
  newPassword = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="auth-password-control">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          aria-describedby={newPassword ? `${id}-help` : undefined}
          required
          type={visible ? 'text' : 'password'}
          minLength={8}
          maxLength={32}
          autoComplete={newPassword ? 'new-password' : 'current-password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {newPassword && (
        <small id={`${id}-help`}>Use 8–32 characters. Spaces are kept as entered.</small>
      )}
    </div>
  );
}
export function AuthNotice({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p className="auth-notice auth-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="auth-notice auth-success" role="status">
          {success}
        </p>
      )}
    </>
  );
}
