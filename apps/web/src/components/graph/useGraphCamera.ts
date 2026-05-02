/**
 * @file Graph-related React hook: useGraphCamera.
 */

import { useEffect } from "react";

type UseGraphCameraOptions = {
  enabled: boolean;
  frameAllNodes: () => void;
  focusActiveNode: () => void;
  topDownView: () => void;
};

const isGraphBackgroundTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.getAttribute !== "function") {
    return true;
  }
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) {
    return false;
  }
  const role = el.getAttribute("role");
  if (role === "combobox" || role === "listbox" || role === "searchbox" || role === "textbox") {
    return false;
  }
  return true;
};

export const useGraphCamera = ({
  enabled,
  frameAllNodes,
  focusActiveNode,
  topDownView
}: UseGraphCameraOptions) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled) {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (!isGraphBackgroundTarget(event.target)) {
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
  }, [enabled, focusActiveNode, frameAllNodes, topDownView]);
};
