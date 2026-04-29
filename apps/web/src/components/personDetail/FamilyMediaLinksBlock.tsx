import { useState } from "react";
import type { MediaObjectRecord, TargetMediaLinkRecord } from "../../lib/api";

type Props = {
  familyId: string;
  links: TargetMediaLinkRecord[] | undefined;
  mediaObjects: MediaObjectRecord[];
  managementEnabled: boolean;
  disabled?: boolean;
  onAttach?: (familyId: string, mediaObjectId: string) => Promise<void>;
  onUnlink?: (linkId: string) => Promise<void>;
};

export const FamilyMediaLinksBlock = ({
  familyId,
  links,
  mediaObjects,
  managementEnabled,
  disabled,
  onAttach,
  onUnlink
}: Props) => {
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attach = async () => {
    if (!selectedMediaId || !onAttach) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAttach(familyId, selectedMediaId);
      setSelectedMediaId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach media");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (linkId: string) => {
    if (!onUnlink) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onUnlink(linkId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlink media");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field-group family-media-block">
      <span className="field-label">Family media</span>
      {error ? <p className="hint hint--danger">{error}</p> : null}
      {links === undefined ? (
        <p className="hint">Loading family media...</p>
      ) : links.length === 0 ? (
        <p className="hint">No media linked to this family.</p>
      ) : (
        <ul className="evidence-list">
          {links.map((link) => (
            <li key={link.id}>
              <strong>{link.mediaObject.title?.trim() || "Untitled"}</strong>
              {" · "}
              <a href={link.mediaObject.storageUrl} target="_blank" rel="noreferrer">
                open
              </a>
              {managementEnabled && onUnlink ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="text-link-button"
                    disabled={disabled || busy}
                    onClick={() => void unlink(link.id)}
                  >
                    Unlink
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {managementEnabled ? (
        <div className="family-unit-actions-inline">
          <select
            value={selectedMediaId}
            disabled={disabled || busy || mediaObjects.length === 0}
            onChange={(event) => setSelectedMediaId(event.target.value)}
          >
            <option value="">Attach existing media...</option>
            {mediaObjects.map((media) => (
              <option key={media.id} value={media.id}>
                {media.title?.trim() || media.storageUrl}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary-button"
            disabled={disabled || busy || !selectedMediaId}
            onClick={() => void attach()}
          >
            Attach
          </button>
        </div>
      ) : (
        <p className="hint">Evidence management is disabled; existing links are read-only.</p>
      )}
    </div>
  );
};
