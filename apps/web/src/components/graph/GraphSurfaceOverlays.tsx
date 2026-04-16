type Props = {
  isLoading: boolean;
  loadError: string | null;
};

export const GraphSurfaceOverlays = ({ isLoading, loadError }: Props) => {
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
    </>
  );
};
