import { useState } from "react";

type Props = {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
};

export const AuthScreen = ({ busy, error, onSubmit }: Props) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(email, password);
  };

  return (
    <main className="auth-screen">
      <section className="card auth-card stack">
        <div className="stack">
          <h1>Sign in to Treemich</h1>
          <p className="hint">
            Use the same Immich email and password for the server configured in Treemich.
          </p>
        </div>
        <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-group">
            <span className="field-label">Email</span>
            <input
              autoComplete="username"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </label>
          <label className="field-group">
            <span className="field-label">Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
};
