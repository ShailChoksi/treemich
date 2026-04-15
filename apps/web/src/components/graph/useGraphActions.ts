type UseGraphActionsOptions = {
  clearSelection: () => void;
  setSearchFeedback: (message: string | null) => void;
  handleCreateRelationship: () => Promise<boolean>;
  onDeleteWithConfirmation: () => Promise<boolean>;
  setFocusPersonId: (personId: string | null) => void;
  setPinnedPersonId: (personId: string | null) => void;
};

export const useGraphActions = ({
  clearSelection,
  setSearchFeedback,
  handleCreateRelationship,
  onDeleteWithConfirmation,
  setFocusPersonId,
  setPinnedPersonId
}: UseGraphActionsOptions) => {
  const onClearSelection = () => {
    clearSelection();
    setSearchFeedback("Selection cleared");
  };

  const onSaveRelationship = () => {
    void handleCreateRelationship().then((didSave) => {
      if (didSave) {
        setSearchFeedback("Relationship saved");
      }
    });
  };

  const onDeleteRelationship = () => {
    void onDeleteWithConfirmation().then((didDelete) => {
      if (didDelete) {
        setSearchFeedback("Relationship deleted");
      }
    });
  };

  const onResetView = () => {
    setFocusPersonId(null);
    setPinnedPersonId(null);
    setSearchFeedback("Focus cleared");
  };

  return {
    onClearSelection,
    onSaveRelationship,
    onDeleteRelationship,
    onResetView
  };
};
