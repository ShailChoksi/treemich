import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthScreen } from "./components/AuthScreen";
import { SetPasswordScreen } from "./components/SetPasswordScreen";
import {
  CURRENT_ONBOARDING_TUTORIAL_VERSION,
  OnboardingTutorialDialog
} from "./components/OnboardingTutorialDialog";
import {
  changePassword,
  getCurrentUser,
  getLinkStatus,
  getUserPreferences,
  IMMICH_PEOPLE_SYNCED_EVENT,
  linkImmichAccount,
  login,
  logout,
  syncImmichLabelledPeople,
  unlinkImmichAccount,
  updateUserPreferences,
  type AuthState,
  type LoginProvider,
  type UserPreferences
} from "./lib/api";

const PeoplePage = lazy(async () => {
  const mod = await import("./pages/people");
  return { default: mod.PeoplePage };
});

export const App = () => {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [immichLinkEmail, setImmichLinkEmail] = useState("");
  const [immichLinkPassword, setImmichLinkPassword] = useState("");
  const [isLinkingImmich, setIsLinkingImmich] = useState(false);
  const [immichLinkMessage, setImmichLinkMessage] = useState<string | null>(null);
  const [immichLinkError, setImmichLinkError] = useState<string | null>(null);
  const [immichAutoSyncMessage, setImmichAutoSyncMessage] = useState<string | null>(null);
  const [onboardingPrefs, setOnboardingPrefs] = useState<UserPreferences | null>(null);
  const [onboardingLoadStatus, setOnboardingLoadStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle"
  );
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialPersistOnDismiss, setTutorialPersistOnDismiss] = useState(true);
  const [tutorialSaving, setTutorialSaving] = useState(false);
  const [tutorialSaveError, setTutorialSaveError] = useState<string | null>(null);
  const didAutoOpenTutorialRef = useRef(false);
  const currentUser = authState?.user;
  const linkStatus = authState?.linkStatus;

  useEffect(() => {
    if (!authState?.authenticated || !currentUser) {
      didAutoOpenTutorialRef.current = false;
      setOnboardingPrefs(null);
      setOnboardingLoadStatus("idle");
      setTutorialOpen(false);
      setTutorialSaveError(null);
      setTutorialSaving(false);
      return;
    }

    didAutoOpenTutorialRef.current = false;
    let cancelled = false;
    setOnboardingLoadStatus("loading");
    void getUserPreferences()
      .then((prefs) => {
        if (cancelled) {
          return;
        }
        setOnboardingPrefs(prefs);
        setOnboardingLoadStatus("ready");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setOnboardingLoadStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [authState?.authenticated, currentUser?.id]);

  useEffect(() => {
    if (!immichAutoSyncMessage) {
      return;
    }
    const timeout = window.setTimeout(() => setImmichAutoSyncMessage(null), 10_000);
    return () => window.clearTimeout(timeout);
  }, [immichAutoSyncMessage]);

  useEffect(() => {
    if (onboardingLoadStatus !== "ready" || didAutoOpenTutorialRef.current) {
      return;
    }
    if (onboardingPrefs?.onboardingTutorial?.dismissedVersion === CURRENT_ONBOARDING_TUTORIAL_VERSION) {
      return;
    }
    didAutoOpenTutorialRef.current = true;
    setTutorialPersistOnDismiss(true);
    setTutorialSaveError(null);
    setTutorialOpen(true);
  }, [onboardingLoadStatus, onboardingPrefs]);

  const handleTutorialPersist = useCallback(async () => {
    setTutorialSaving(true);
    setTutorialSaveError(null);
    try {
      const next = await updateUserPreferences({
        onboardingTutorial: {
          dismissedVersion: CURRENT_ONBOARDING_TUTORIAL_VERSION,
          dismissedAt: new Date().toISOString()
        }
      });
      setOnboardingPrefs(next);
      setTutorialOpen(false);
    } catch (error: unknown) {
      setTutorialSaveError(error instanceof Error ? error.message : "Could not save tutorial state.");
    } finally {
      setTutorialSaving(false);
    }
  }, []);

  const handleTutorialDialogClose = useCallback(() => {
    setTutorialOpen(false);
    setTutorialSaveError(null);
  }, []);

  const handleReplayOnboardingTutorial = useCallback(() => {
    const alreadyDismissed =
      onboardingPrefs?.onboardingTutorial?.dismissedVersion === CURRENT_ONBOARDING_TUTORIAL_VERSION;
    setTutorialPersistOnDismiss(!alreadyDismissed);
    setTutorialSaveError(null);
    setTutorialOpen(true);
  }, [onboardingPrefs]);

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

  const handleLogin = async (email: string, password: string, provider: LoginProvider) => {
    setIsSubmittingAuth(true);
    setAuthError(null);
    try {
      const state = await login(email, password, provider);
      const latestLinkStatus = state.authenticated ? await getLinkStatus() : state.linkStatus;
      setAuthState({
        ...state,
        linkStatus: latestLinkStatus
      });
      if (provider === "immich" && latestLinkStatus?.linked) {
        try {
          const sync = await syncImmichLabelledPeople();
          window.dispatchEvent(new Event(IMMICH_PEOPLE_SYNCED_EVENT));
          if (sync.created > 0) {
            setImmichAutoSyncMessage(
              `${sync.created} new Immich ${sync.created === 1 ? "person" : "people"} added to your tree.`
            );
          }
        } catch {
          /* non-blocking: server sync is optional */
        }
      }
    } catch (error: unknown) {
      setAuthError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLinkImmich = async () => {
    if (linkStatus?.linked && !window.confirm("Replace the currently linked Immich account?")) {
      return;
    }
    setIsLinkingImmich(true);
    setImmichLinkError(null);
    setImmichLinkMessage(null);
    try {
      const latestLinkStatus = await linkImmichAccount(immichLinkEmail, immichLinkPassword);
      setAuthState((state) => (state ? { ...state, linkStatus: latestLinkStatus } : state));
      setImmichLinkPassword("");
      setImmichLinkMessage(latestLinkStatus.linked ? "Immich account linked." : null);
      if (latestLinkStatus.linked) {
        try {
          const sync = await syncImmichLabelledPeople();
          window.dispatchEvent(new Event(IMMICH_PEOPLE_SYNCED_EVENT));
          if (sync.created > 0) {
            setImmichAutoSyncMessage(
              `${sync.created} new Immich ${sync.created === 1 ? "person" : "people"} added to your tree.`
            );
          }
        } catch {
          /* non-blocking */
        }
      }
    } catch (error: unknown) {
      setImmichLinkError(error instanceof Error ? error.message : "Failed to link Immich account");
    } finally {
      setIsLinkingImmich(false);
    }
  };

  const handleUnlinkImmich = async () => {
    if (
      !window.confirm(
        "Unlink Immich? Provider imports, thumbnail refreshes, and co-occurrence imports will stop, but imported genealogy data is preserved."
      )
    ) {
      return;
    }
    setIsLinkingImmich(true);
    setImmichLinkError(null);
    setImmichLinkMessage(null);
    try {
      const latestLinkStatus = await unlinkImmichAccount();
      setAuthState((state) => (state ? { ...state, linkStatus: latestLinkStatus } : state));
      setImmichLinkMessage("Immich account unlinked.");
    } catch (error: unknown) {
      setImmichLinkError(error instanceof Error ? error.message : "Failed to unlink Immich account");
    } finally {
      setIsLinkingImmich(false);
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

  if (isBooting) {
    return (
      <main className="auth-screen">
        <section className="card auth-card stack">
          <h1>Loading Treemich</h1>
          <div className="skeleton-card auth-skeleton" aria-label="Checking your current session">
            <span className="sr-only">Checking your current session.</span>
          </div>
        </section>
      </main>
    );
  }

  if (!authState?.authenticated || !currentUser) {
    return <AuthScreen busy={isSubmittingAuth} error={authError} onSubmit={handleLogin} />;
  }

  if (currentUser.passwordChangeRequired) {
    return (
      <SetPasswordScreen
        onSubmit={changePassword}
        onPasswordChanged={async () => {
          const freshState = await getCurrentUser();
          setAuthState(freshState);
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="card session-bar">
        <div className="session-bar-left">
          <h1 className="app-title">Treemich</h1>
          {immichAutoSyncMessage ? (
            <p className="hint" role="status">
              {immichAutoSyncMessage}
            </p>
          ) : null}
          <details className="account-provider-panel" data-onboarding-target="immich-provider">
            <summary>
              Immich provider: {linkStatus?.linked ? (linkStatus.immichEmail ?? "linked") : "not linked"}
            </summary>
            <div className="stack">
              <p className="hint">
                Link Immich only when you want provider-backed imports, thumbnail refreshes, or photo
                co-occurrence.
              </p>
              <label className="field-group">
                <span className="field-label">Immich email</span>
                <input
                  type="email"
                  value={immichLinkEmail}
                  onChange={(event) => setImmichLinkEmail(event.target.value)}
                  placeholder={linkStatus?.immichEmail ?? "name@example.com"}
                />
              </label>
              <label className="field-group">
                <span className="field-label">Immich password</span>
                <input
                  type="password"
                  value={immichLinkPassword}
                  onChange={(event) => setImmichLinkPassword(event.target.value)}
                />
              </label>
              {immichLinkError ? <p className="auth-error">{immichLinkError}</p> : null}
              {immichLinkMessage ? <p className="hint">{immichLinkMessage}</p> : null}
              <div className="toolbar-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isLinkingImmich || !immichLinkEmail || !immichLinkPassword}
                  onClick={() => void handleLinkImmich()}
                >
                  {linkStatus?.linked ? "Replace linked Immich account" : "Link Immich account"}
                </button>
                {linkStatus?.linked ? (
                  <button
                    type="button"
                    className="secondary-button danger-button"
                    disabled={isLinkingImmich}
                    onClick={() => void handleUnlinkImmich()}
                  >
                    Unlink Immich
                  </button>
                ) : null}
              </div>
            </div>
          </details>
        </div>
        <div className="session-bar-right">
          <strong className="session-user-name">{currentUser.name}</strong>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleLogout()}
            disabled={isSubmittingAuth}
          >
            {isSubmittingAuth ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>
      <OnboardingTutorialDialog
        open={tutorialOpen}
        persistOnDismiss={tutorialPersistOnDismiss}
        isSaving={tutorialSaving}
        saveError={tutorialSaveError}
        onComplete={handleTutorialPersist}
        onClose={handleTutorialDialogClose}
      />
      <ErrorBoundary
        errorContext="Authenticated app"
        fallback={
          <section className="card stack app-shell-fallback-card">
            <h2 className="app-title app-shell-fallback-title">Something went wrong</h2>
            <p className="hint">
              The app hit an unexpected error. Reload the page to try again. If the problem persists, check
              the browser console for details.
            </p>
          </section>
        }
      >
        <Suspense
          fallback={
            <section className="card stack app-shell-fallback-card">
              <div className="skeleton-card app-shell-skeleton" aria-label="Loading graph" />
            </section>
          }
        >
          <PeoplePage
            immichBaseUrl={linkStatus?.immichBaseUrl ?? null}
            currentUserName={linkStatus?.immichName ?? currentUser.name}
            onReplayOnboardingTutorial={handleReplayOnboardingTutorial}
          />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
};
