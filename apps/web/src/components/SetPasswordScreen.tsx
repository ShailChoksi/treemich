/**
 * @file Forced password change screen shown when passwordChangeRequired is true on the logged-in user.
 */

import { useState } from "react";

type Props = {
  onPasswordChanged: () => Promise<void>;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
};

export const SetPasswordScreen = ({ onPasswordChanged, onSubmit }: Props) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      await onSubmit(currentPassword, newPassword);
      await onPasswordChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setBusy(false);
    }
  };

  const errorId = error ? "set-password-error" : undefined;

  return (
    <main className="auth-screen">
      <section className="card auth-card stack">
        <div className="stack">
          <h1>Set a new password</h1>
          <p className="hint">
            Your account requires a password change before continuing. Please choose a new password (minimum 8
            characters).
          </p>
        </div>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)} aria-describedby={errorId}>
          <label className="field-group">
            <span className="field-label">Current password</span>
            <input
              name="currentPassword"
              autoComplete="current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              aria-invalid={error ? true : undefined}
            />
          </label>
          <label className="field-group">
            <span className="field-label">New password</span>
            <input
              name="newPassword"
              autoComplete="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
              aria-invalid={error ? true : undefined}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Confirm new password</span>
            <input
              name="confirmPassword"
              autoComplete="new-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              aria-invalid={error ? true : undefined}
            />
          </label>
          {error ? (
            <p id={errorId} className="auth-error" aria-live="polite">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? "Changing password..." : "Change password"}
          </button>
        </form>
      </section>
    </main>
  );
};
