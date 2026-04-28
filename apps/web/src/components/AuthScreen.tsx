/**
 * @file Login and Immich account linking for unauthenticated sessions.
 */

import { useState } from "react";
import type { LoginProvider } from "../lib/api";

type Props = {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string, provider: LoginProvider) => Promise<void>;
};

export const AuthScreen = ({ busy, error, onSubmit }: Props) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [provider, setProvider] = useState<LoginProvider>("treemich");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(email, password, provider);
  };
  const errorId = error ? "auth-screen-error" : undefined;

  return (
    <main className="auth-screen">
      <section className="card auth-card stack">
        <div className="stack">
          <h1>Sign in to Treemich</h1>
          <p className="hint">
            Use your Treemich email and password. On a fresh install, the first sign-in creates the first
            standalone Treemich account.
          </p>
          <p className="hint">
            Existing Immich-first users can choose the legacy Immich migration login below, then manage Immich
            linking from inside Treemich.
          </p>
        </div>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)} aria-describedby={errorId}>
          <label className="field-group">
            <span className="field-label">Sign-in method</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as LoginProvider)}>
              <option value="treemich">Treemich account</option>
              <option value="immich">Legacy Immich migration login</option>
            </select>
          </label>
          <label className="field-group">
            <span className="field-label">Email</span>
            <input
              name="email"
              autoComplete="username"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Password</span>
            <input
              name="password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={errorId}
            />
          </label>
          {error ? (
            <p id={errorId} className="auth-error" aria-live="polite">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};
