import { useEffect } from "react";

type UseGraphCameraOptions = {
  frameAllNodes: () => void;
  focusActiveNode: () => void;
  topDownView: () => void;
};

export const useGraphCamera = ({ frameAllNodes, focusActiveNode, topDownView }: UseGraphCameraOptions) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        frameAllNodes();
      } else if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        focusActiveNode();
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        topDownView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusActiveNode, frameAllNodes, topDownView]);
};
