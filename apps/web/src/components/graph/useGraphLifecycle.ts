import { useTexture } from "@react-three/drei";
import { useEffect } from "react";
import { personThumbnailUrl } from "../../lib/api";

type UseGraphLifecycleOptions = {
  thumbnailNodeIds: Set<string>;
};

export const useGraphLifecycle = ({ thumbnailNodeIds }: UseGraphLifecycleOptions) => {
  useEffect(() => {
    for (const personId of thumbnailNodeIds) {
      useTexture.preload(personThumbnailUrl(personId));
    }
  }, [thumbnailNodeIds]);
};
