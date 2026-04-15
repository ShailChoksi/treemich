import { useTexture } from "@react-three/drei";
import { useEffect } from "react";
import { personThumbnailUrl } from "../../lib/api";

type UseGraphLifecycleOptions = {
  thumbnailNodeIds: Set<string>;
  selectedPersonId: string | null;
  onSelectedPersonChange?: (personId: string | null) => void;
};

export const useGraphLifecycle = ({
  thumbnailNodeIds,
  selectedPersonId,
  onSelectedPersonChange
}: UseGraphLifecycleOptions) => {
  useEffect(() => {
    for (const personId of thumbnailNodeIds) {
      useTexture.preload(personThumbnailUrl(personId));
    }
  }, [thumbnailNodeIds]);

  useEffect(() => {
    onSelectedPersonChange?.(selectedPersonId);
  }, [onSelectedPersonChange, selectedPersonId]);
};
