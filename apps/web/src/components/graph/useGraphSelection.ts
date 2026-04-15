import { useCallback } from "react";

type UseGraphSelectionOptions = {
  selectedPersonId: string | null;
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
  onSelectedPersonChange?: (personId: string | null) => void;
};

export const useGraphSelection = ({
  selectedPersonId,
  setFocusPersonId,
  setPinnedPersonId,
  onSelectedPersonChange
}: UseGraphSelectionOptions) => {
  const setSelectedPersonId = useCallback(
    (personId: string | null) => {
      onSelectedPersonChange?.(personId);
    },
    [onSelectedPersonChange]
  );

  const clearSelection = useCallback(() => {
    onSelectedPersonChange?.(null);
    setPinnedPersonId(null);
  }, [onSelectedPersonChange, setPinnedPersonId]);

  const handleNodeClick = useCallback(
    (clickedPersonId: string) => {
      onSelectedPersonChange?.(clickedPersonId);
      setFocusPersonId(clickedPersonId);
      setPinnedPersonId(null);
    },
    [onSelectedPersonChange, setFocusPersonId, setPinnedPersonId]
  );

  return {
    selectedPersonId,
    setSelectedPersonId,
    clearSelection,
    handleNodeClick
  };
};
