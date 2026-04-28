/**
 * @file Accessible dialog for creating standalone Treemich people.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { CreatePersonBody, Gender } from "../lib/api";

type Props = {
  open: boolean;
  title?: string;
  defaultGivenName?: string;
  busy?: boolean;
  onConfirm: (body: CreatePersonBody) => void | Promise<void>;
  onCancel: () => void;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const normalizeOptionalString = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const CreatePersonDialog = ({
  open,
  title = "New Person",
  defaultGivenName = "",
  busy = false,
  onConfirm,
  onCancel
}: Props) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [givenName, setGivenName] = useState(defaultGivenName);
  const [surname, setSurname] = useState("");
  const [gender, setGender] = useState<Gender>("UNKNOWN");

  useEffect(() => {
    if (!open) {
      return;
    }
    setGivenName(defaultGivenName);
    setSurname("");
    setGender("UNKNOWN");
  }, [defaultGivenName, open]);

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
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) {
      return;
    }
    const focusables = getFocusableElements();
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first == null || last == null) {
      return;
    }
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!open) {
    return null;
  }

  const normalizedGivenName = normalizeOptionalString(givenName);
  const normalizedSurname = normalizeOptionalString(surname);
  const canSubmit = Boolean(normalizedGivenName || normalizedSurname);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) {
      return;
    }
    void onConfirm({
      givenName: normalizedGivenName,
      surname: normalizedSurname,
      gender
    });
  };

  return (
    <>
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Cancel creating person"
        onClick={() => {
          if (!busy) {
            onCancel();
          }
        }}
        disabled={busy}
      />
      <div
        ref={dialogRef}
        className="confirm-dialog create-person-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleDialogKeyDown}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={descriptionId} className="hint confirm-dialog-description">
          Create a person in Treemich without linking them to Immich.
        </p>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field-group">
            <span className="field-label">Given name</span>
            <input
              ref={firstInputRef}
              value={givenName}
              onChange={(event) => setGivenName(event.target.value)}
              placeholder="Given name"
            />
          </label>
          <label className="field-group">
            <span className="field-label">Surname</span>
            <input value={surname} onChange={(event) => setSurname(event.target.value)} placeholder="Surname" />
          </label>
          <label className="field-group">
            <span className="field-label">Gender</span>
            <select value={gender} onChange={(event) => setGender(event.target.value as Gender)}>
              <option value="UNKNOWN">Unknown</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </label>
          <div className="confirm-dialog-actions">
            <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="confirm-dialog-submit" disabled={busy || !canSubmit}>
              {busy ? "Creating..." : "Create person"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
};
