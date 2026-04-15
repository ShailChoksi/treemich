import { useEffect, useState } from "react";

type UseGraphSelectionOptions = {
  selectedPersonId: string | null;
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
};

export const useGraphSelection = ({
  selectedPersonId: controlledSelectedPersonId,
  setFocusPersonId,
  setPinnedPersonId
}: UseGraphSelectionOptions) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(controlledSelectedPersonId);

  useEffect(() => {
    setSelectedPersonId(controlledSelectedPersonId);
  }, [controlledSelectedPersonId]);

  const clearSelection = () => {
    setSelectedPersonId(null);
    setPinnedPersonId(null);
  };

  const handleNodeClick = (clickedPersonId: string) => {
    setSelectedPersonId(clickedPersonId);
    setFocusPersonId(clickedPersonId);
    setPinnedPersonId(null);
  };

  return {
    selectedPersonId,
    setSelectedPersonId,
    clearSelection,
    handleNodeClick
  };
};
