/**
 * @file 2D SVG/HTML overlays above the WebGL graph (lines, controls chrome).
 */

type Props = {
  isLoading: boolean;
  loadError: string | null;
  isLayoutWorkerPending?: boolean;
};

export const GraphSurfaceOverlays = ({ isLoading, loadError, isLayoutWorkerPending }: Props) => {
  return (
    <>
      {isLoading ? (
        <div className="graph-overlay">
          <p>Loading family graph...</p>
        </div>
      ) : null}
      {loadError ? (
        <div className="graph-overlay graph-overlay-error">
          <p>Failed to load graph: {loadError}</p>
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
