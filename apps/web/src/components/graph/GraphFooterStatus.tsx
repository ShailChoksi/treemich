/**
 * @file Compact status and actions row under the graph canvas.
 */

type Props = {
  status: string | null;
  busy: boolean;
  /** Thumbnail loading progress (loaded/total) for the progress indicator. */
  thumbnailProgress?: { loaded: number; total: number } | null;
};

/** Show the faces loading hint when this many or more thumbnails are in the load order. */
export const GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL = 30;

export const GraphFooterStatus = ({ status, busy, thumbnailProgress = null }: Props) => {
  const showThumbnailProgress =
    thumbnailProgress &&
    thumbnailProgress.total >= GRAPH_FOOTER_THUMBNAIL_PROGRESS_MIN_TOTAL &&
    thumbnailProgress.loaded < thumbnailProgress.total;

  return (
    <div aria-live="polite" role="status">
      {status ? <p>{status}</p> : null}
      {busy ? <p>Saving relationship...</p> : null}
      {showThumbnailProgress ? (
        <p className="hint">
          Loading faces... {thumbnailProgress.loaded}/{thumbnailProgress.total}
        </p>
      ) : null}
    </div>
  );
};
