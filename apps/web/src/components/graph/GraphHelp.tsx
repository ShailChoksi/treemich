type Props = {
  selectedPersonName: string | null;
};

export const GraphHelp = ({ selectedPersonName }: Props) => {
  return (
    <details className="graph-help">
      <summary>How to use the graph</summary>
      <p className="hint">
        Click one face, then another to create a relationship link.
        {selectedPersonName ? ` Selected source: ${selectedPersonName}` : ""}
      </p>
      <p className="hint">Navigation: drag left to pan, right to rotate, wheel to zoom. Shortcuts: F frame, G focus, T top.</p>
      <p className="hint">Line colors: gray = parent/child, amber = spouse, green = sibling.</p>
    </details>
  );
};
