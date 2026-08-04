import { createContext, useContext, type ReactNode } from "react";
import type { GraphVisibilityBucket } from "./graphVisibility";

/** Builds a thumbnail fetch URL for a person (owner vs guest share routes). */
export type ResolveThumbnailUrl = (personId: string, cacheKey?: string) => string;

type GraphSceneContextValue = {
  peopleIds: string[];
  thumbnailCacheKeys?: Record<string, string | undefined>;
  prioritizedNodeIds: Set<string>;
  renderNearPersonIds: string[];
  renderVisibilityBucketByPersonId: Map<string, GraphVisibilityBucket>;
  /** Defaults to owner `personThumbnailUrl` when omitted. */
  resolveThumbnailUrl?: ResolveThumbnailUrl;
};

const GraphSceneContext = createContext<GraphSceneContextValue | null>(null);

export const GraphSceneProvider = ({
  value,
  children
}: {
  value: GraphSceneContextValue;
  children: ReactNode;
}) => <GraphSceneContext.Provider value={value}>{children}</GraphSceneContext.Provider>;

export const useGraphScene = () => {
  const context = useContext(GraphSceneContext);
  if (!context) {
    throw new Error("useGraphScene must be used within GraphSceneProvider");
  }
  return context;
};
