/**
 * @file 2D SVG/HTML overlays above the WebGL graph (lines, controls chrome).
 */

type Props = {
  isLoading: boolean;
  loadError: string | null;
  layoutError?: string | null;
  isLayoutWorkerPending?: boolean;
  onRetryGraphLoad?: () => void;
  onRetryLayout?: () => void;
};

export const GraphSurfaceOverlays = ({
  isLoading,
  loadError,
  layoutError,
  isLayoutWorkerPending,
  onRetryGraphLoad,
  onRetryLayout
}: Props) => {
  return (
    <>
      {isLoading ? (
        <div className="graph-overlay">
          <div className="skeleton-card graph-skeleton" aria-label="Loading family graph" />
        </div>
      ) : null}
      {loadError ? (
        <div className="graph-overlay graph-overlay-error">
          <p>Failed to load graph: {loadError}</p>
          {onRetryGraphLoad ? (
            <button type="button" className="secondary-button" onClick={onRetryGraphLoad}>
              Retry graph load
            </button>
          ) : null}
        </div>
      ) : null}
      {!loadError && layoutError ? (
        <div className="graph-layout-error-banner" role="status" aria-live="polite">
          <span>{layoutError}</span>
          {onRetryLayout ? (
            <button
              type="button"
              className="secondary-button workspace-action-button--compact"
              onClick={onRetryLayout}
            >
              Retry layout
            </button>
          ) : null}
        </div>
      ) : null}
      {isLayoutWorkerPending ? (
        <div className="graph-layout-updating-banner" role="status" aria-live="polite">
          Updating layout…
        </div>
      ) : null}
    </>
  );
};
