/**
 * @file Dialog to create a password-protected Focus Share from Focus chrome.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import type { FocusShareRecord } from "@treemich/shared";
import { createFocusShare, focusShareAbsoluteUrl } from "../../lib/api";

type Props = {
  open: boolean;
  focusAnchorPersonId: string;
  focusAnchorLabel: string;
  maxAncestorDepth: number;
  maxDescendantDepth: number;
  maxCollateralDepth: number;
  onClose: () => void;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const CreateFocusShareDialog = ({
  open,
  focusAnchorPersonId,
  focusAnchorLabel,
  maxAncestorDepth,
  maxDescendantDepth,
  maxCollateralDepth,
  onClose
}: Props) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<FocusShareRecord | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLabel("");
    setPassword("");
    setBusy(false);
    setError(null);
    setCreated(null);
    setCopied(false);
  }, [open]);

  const getFocusableElements = useCallback(() => {
    const root = dialogRef.current;
    if (!root) {
      return [] as HTMLElement[];
    }
    return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (el) => el.offsetParent !== null || el.getClientRects().length > 0
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      firstInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const share = await createFocusShare({
        password,
        label: label.trim() ? label.trim() : null,
        focusAnchorPersonId,
        maxAncestorDepth,
        maxDescendantDepth,
        maxCollateralDepth
      });
      setCreated(share);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Focus Share");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!created) {
      return;
    }
    const url = focusShareAbsoluteUrl(created.publicPath);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy link — select and copy it manually.");
    }
  };

  if (!open) {
    return null;
  }

  // Portal to body so graph Html overlays (+ / lock badges) and the search panel's
  // backdrop-filter stacking context cannot paint above the modal.
  return createPortal(
    <div className="confirm-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <h3 id={titleId}>{created ? "Focus Share created" : "Share Focus view"}</h3>
        <p id={descriptionId} className="hint confirm-dialog-description">
          {created
            ? "Copy this link and share the password separately. Recipients see a read-only graph."
            : `Create a password-protected link for the Focus cone rooted on ${focusAnchorLabel} (↑${maxAncestorDepth} ↓${maxDescendantDepth} siblings ${maxCollateralDepth}).`}
        </p>

        {created ? (
          <div className="stack-form">
            <label>
              Public link
              <input
                type="text"
                readOnly
                value={focusShareAbsoluteUrl(created.publicPath)}
                aria-label="Focus Share public link"
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <div className="confirm-dialog-actions">
              <button type="button" className="secondary-button" onClick={onClose}>
                Done
              </button>
              <button type="button" className="confirm-dialog-submit" onClick={() => void handleCopy()}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        ) : (
          <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              Label (optional)
              <input
                ref={firstInputRef}
                type="text"
                value={label}
                maxLength={200}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Mom's side for reunion"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                minLength={8}
                required
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="error-text">{error}</p> : null}
            <div className="confirm-dialog-actions">
              <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="confirm-dialog-submit" disabled={busy || password.length < 8}>
                {busy ? "Creating…" : "Create link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
