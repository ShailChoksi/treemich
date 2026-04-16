import { useEffect, useMemo, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { getCurrentUser, getLinkStatus, login, logout, type AuthState } from "./lib/api";
import { PeoplePage } from "./pages/people";

export const App = () => {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const currentUser = authState?.user;
  const linkStatus = authState?.linkStatus;

  useEffect(() => {
    getCurrentUser()
      .then(async (state) => {
        if (state.authenticated) {
          try {
            const latestLinkStatus = await getLinkStatus();
            setAuthState({
              ...state,
              linkStatus: latestLinkStatus
            });
          } catch {
            setAuthState(state);
          }
          return;
        }

        setAuthState(state);
      })
      .catch((error: unknown) => {
        setAuthError(error instanceof Error ? error.message : "Failed to load session");
        setAuthState({
          authenticated: false,
          linkStatus: {
            linked: false
          }
        });
      })
      .finally(() => {
        setIsBooting(false);
      });
  }, []);

  const handleLogin = async (email: string, password: string) => {
    setIsSubmittingAuth(true);
    setAuthError(null);
    try {
      const state = await login(email, password);
      const latestLinkStatus = state.authenticated ? await getLinkStatus() : state.linkStatus;
      setAuthState({
        ...state,
        linkStatus: latestLinkStatus
      });
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    setIsSubmittingAuth(true);
    setAuthError(null);
    try {
      await logout();
      setAuthState({
        authenticated: false,
        linkStatus: {
          linked: false
        }
      });
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Logout failed");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const headerSummary = useMemo(() => {
    if (!currentUser) {
      return null;
    }

    return linkStatus?.immichEmail ? `${currentUser.name} · ${linkStatus.immichEmail}` : currentUser.name;
  }, [currentUser, linkStatus?.immichEmail]);

  if (isBooting) {
    return (
      <main className="auth-screen">
        <section className="card auth-card stack">
          <h1>Loading Treemich</h1>
          <p className="hint">Checking your current session.</p>
        </section>
      </main>
    );
  }

  if (!authState?.authenticated || !currentUser) {
    return <AuthScreen busy={isSubmittingAuth} error={authError} onSubmit={handleLogin} />;
  }

  return (
    <main className="app-shell">
      <header className="card session-bar">
        <div className="stack">
          <strong>{headerSummary}</strong>
          <span className="hint">
            {linkStatus?.linked ? "Linked to Immich" : "Immich account not linked"}
          </span>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void handleLogout()}
          disabled={isSubmittingAuth}
        >
          {isSubmittingAuth ? "Signing out..." : "Sign out"}
        </button>
      </header>
      <PeoplePage immichBaseUrl={linkStatus?.immichBaseUrl ?? null} />
    </main>
  );
};
