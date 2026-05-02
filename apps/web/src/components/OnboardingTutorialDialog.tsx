/**
 * @file First-login onboarding: spotlight tour that highlights real UI, with versioned dismissal handled by parent.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import { createPortal } from "react-dom";

export const CURRENT_ONBOARDING_TUTORIAL_VERSION = "v1";

const STEP_COUNT = 5;
const SPOTLIGHT_PAD = 10;
const TOOLTIP_GAP = 14;
const TOOLTIP_WIDTH = 400;
const TOOLTIP_MIN_TOP = 12;

type TourStep = {
  /** `document.querySelector(\`[data-onboarding-target="${targetKey}"]\`)` */
  targetKey: string;
  title: string;
  body: string;
};

const TOUR_STEPS: readonly TourStep[] = [
  {
    targetKey: "main-content",
    title: "Welcome to Treemich",
    body: "This is your main workspace: the tree, profiles, imports, and exports live here. Use the left rail to switch workspaces; Tree is where you build and explore relationships."
  },
  {
    targetKey: "new-person",
    title: "Add your first people",
    body: "Use + New person to create someone directly in Treemich. You can also bring people in from GEDCOM or Immich later—every person gets a stable Treemich identity."
  },
  {
    targetKey: "relationship-search",
    title: "Connect the family tree",
    body: "Search by name or describe a relationship in plain language (for example, “mother of Beth”). Select a person to focus the graph, then use on-graph actions to add parents, children, spouses, and more."
  },
  {
    targetKey: "immich-provider",
    title: "Bring in Immich context",
    body: "Expand Immich provider in the header when you want linked photos, imports, or co-occurrence. It is optional—core genealogy works without linking Immich."
  },
  {
    targetKey: "workspace-interchange",
    title: "Review, refine, and export",
    body: "Open Interchange for GEDCOM import/export and other data exchange. Use other workspaces (Profile, Reports, Settings) to review details and tune how the app behaves."
  }
];

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type OnboardingTutorialDialogProps = {
  open: boolean;
  persistOnDismiss: boolean;
  isSaving: boolean;
  saveError: string | null;
  onComplete: () => Promise<void>;
  onClose: () => void;
};

const queryTourTarget = (targetKey: string): HTMLElement | null => {
  const el = document.querySelector(`[data-onboarding-target="${CSS.escape(targetKey)}"]`);
  return el instanceof HTMLElement ? el : null;
};

export const OnboardingTutorialDialog = ({
  open,
  persistOnDismiss,
  isSaving,
  saveError,
  onComplete,
  onClose
}: OnboardingTutorialDialogProps) => {
  const titleId = useId();
  const stepId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const [step, setStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const [targetMissing, setTargetMissing] = useState(false);
  const rafRef = useRef<number | null>(null);

  const stepData = TOUR_STEPS[Math.min(Math.max(step, 0), STEP_COUNT - 1)]!;

  const updateLayout = useCallback(() => {
    if (!open) {
      return;
    }
    const clampedStep = Math.min(Math.max(step, 0), STEP_COUNT - 1);
    const targetKey = TOUR_STEPS[clampedStep]!.targetKey;
    const target = queryTourTarget(targetKey);
    if (!target) {
      setSpotlightRect(null);
      setTargetMissing(true);
      setTooltipStyle({
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: `min(${TOOLTIP_WIDTH}px, calc(100vw - 32px))`,
        maxWidth: TOOLTIP_WIDTH,
        zIndex: 96
      });
      return;
    }
    setTargetMissing(false);
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    const r = target.getBoundingClientRect();
    const top = r.top - SPOTLIGHT_PAD;
    const left = r.left - SPOTLIGHT_PAD;
    const width = r.width + SPOTLIGHT_PAD * 2;
    const height = r.height + SPOTLIGHT_PAD * 2;
    setSpotlightRect({ top, left, width, height });

    const tooltipEl = dialogRef.current;
    const tooltipH = tooltipEl?.offsetHeight ?? 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    let tooltipTop = r.bottom + TOOLTIP_GAP;
    if (tooltipTop + tooltipH > vh - margin) {
      tooltipTop = Math.max(TOOLTIP_MIN_TOP, r.top - TOOLTIP_GAP - tooltipH);
    }
    let tooltipLeft = r.left + r.width / 2 - TOOLTIP_WIDTH / 2;
    tooltipLeft = Math.min(Math.max(margin, tooltipLeft), vw - TOOLTIP_WIDTH - margin);
    if (vw < TOOLTIP_WIDTH + margin * 2) {
      tooltipLeft = margin;
    }

    setTooltipStyle({
      position: "fixed",
      top: `${Math.round(tooltipTop)}px`,
      left: `${Math.round(tooltipLeft)}px`,
      width: `min(${TOOLTIP_WIDTH}px, calc(100vw - 32px))`,
      maxWidth: TOOLTIP_WIDTH,
      transform: "none",
      zIndex: 96
    });
  }, [open, step]);

  const scheduleLayout = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      updateLayout();
    });
  }, [updateLayout]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setStep(0);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    scheduleLayout();
    const onWin = () => scheduleLayout();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [open, scheduleLayout, step]);

  const handleDismiss = useCallback(async () => {
    if (isSaving) {
      return;
    }
    if (persistOnDismiss) {
      await onComplete();
      return;
    }
    onClose();
  }, [isSaving, onClose, onComplete, persistOnDismiss]);

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
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      window.setTimeout(() => {
        primaryButtonRef.current?.focus();
      }, 0);
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      previousFocusRef.current?.focus?.();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const t = window.setTimeout(() => {
      primaryButtonRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        event.preventDefault();
        void handleDismiss();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDismiss, isSaving, open]);

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

  const isLast = step === STEP_COUNT - 1;
  const primaryLabel = isLast ? "Done" : "Next";
  const primaryBusyLabel = isSaving ? "Saving..." : primaryLabel;

  const tourUi = (
    <>
      {spotlightRect && !targetMissing ? (
        <div
          className="onboarding-tour-spotlight-hole"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height
          }}
          aria-hidden="true"
        />
      ) : targetMissing ? (
        <div className="onboarding-tour-fallback-dim" aria-hidden="true" />
      ) : null}
      <div
        ref={dialogRef}
        className={`confirm-dialog onboarding-tour-tooltip ${targetMissing ? "onboarding-tour-tooltip--centered" : ""}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={`${stepId} ${descriptionId}`}
        style={tooltipStyle}
        onKeyDown={handleDialogKeyDown}
      >
        <p id={stepId} className="onboarding-tutorial-step" aria-live="polite">
          Step {step + 1} of {STEP_COUNT}
        </p>
        <h3 id={titleId}>{stepData.title}</h3>
        <div className="onboarding-tutorial-dialog-body">
          <p id={descriptionId} className="hint confirm-dialog-description">
            {stepData.body}
          </p>
        </div>
        {targetMissing ? (
          <p className="hint" role="status">
            This step&apos;s highlight is not available yet (for example, the page may still be loading). Use
            Next to continue—you can replay the tour from Settings later.
          </p>
        ) : null}
        {saveError ? (
          <p className="onboarding-tutorial-error" role="alert">
            {saveError}
          </p>
        ) : null}
        <div className="confirm-dialog-actions onboarding-tutorial-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={isSaving || step === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleDismiss()}
            disabled={isSaving}
          >
            Skip tutorial
          </button>
          <button
            ref={primaryButtonRef}
            type="button"
            className="confirm-dialog-submit"
            disabled={isSaving}
            onClick={() => {
              if (isLast) {
                void handleDismiss();
              } else {
                setStep((s) => Math.min(STEP_COUNT - 1, s + 1));
              }
            }}
          >
            {primaryBusyLabel}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(tourUi, document.body);
};
