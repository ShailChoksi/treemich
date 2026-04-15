import { useState } from "react";

type UseGraphSelectionOptions = {
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
};

export const useGraphSelection = ({ setFocusPersonId, setPinnedPersonId }: UseGraphSelectionOptions) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

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
