import { getLocalStorageItem } from "../../lib/safeLocalStorage";

export const THUMBNAIL_PROFILE_STORAGE_KEY = "treemich:profile-thumbnail-graph";

export const isThumbnailProfilingEnabled = () =>
  import.meta.env.DEV && getLocalStorageItem(THUMBNAIL_PROFILE_STORAGE_KEY) === "true";

export const logThumbnailLoaderProfile = (payload: {
  requestedIdsCount: number;
  loadedTextureCount: number;
  loadedProgressCount: number;
  totalProgressCount: number;
  textureCacheSize: number;
  bitmapCacheSize: number;
  visiblePeopleCount: number;
  nearBucketCount: number;
  nearCameraCount: number;
}) => {
  if (!isThumbnailProfilingEnabled()) {
    return;
  }
  console.info("[treemich:thumbnail-profile] loader", payload);
};

export const logThumbnailRenderProfile = (payload: {
  visiblePeopleCount: number;
  detailedNodeCount: number;
  thumbnailTierNodeCount: number;
  minimalNodeCount: number;
  visibleThumbnailNodeCount: number;
  nearBucketCount: number;
  midBucketCount: number;
  farBucketCount: number;
  culledBucketCount: number;
}) => {
  if (!isThumbnailProfilingEnabled()) {
    return;
  }
  console.info("[treemich:thumbnail-profile] render", payload);
};
