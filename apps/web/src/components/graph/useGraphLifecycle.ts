type UseGraphLifecycleOptions = {
  thumbnailNodeIds: Set<string>;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const useGraphLifecycle = (_options: UseGraphLifecycleOptions) => {
  // Thumbnail preloading is now handled by the worker pipeline in useThumbnailLoader.
  // This hook is kept as a stable integration point for future lifecycle concerns.
};
