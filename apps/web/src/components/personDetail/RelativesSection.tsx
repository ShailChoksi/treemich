/**
 * @file Existing relatives and suggestions with add-relationship affordances.
 */

import { personThumbnailUrl } from "../../lib/api";
import type { ExtendedFamilyMember } from "../graph/extendedFamily";
import type { RelativeItem } from "./types";

type RelativesSectionProps = {
  sectionKey: string;
  title: string;
  items: RelativeItem[];
  extendedFamily?: ExtendedFamilyMember[];
  emptyMessage?: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onFocusPerson: (personId: string) => void;
  resolveExtendedLabel?: (member: ExtendedFamilyMember) => string;
  isSavingRelationship: boolean;
  onStartEditing: (relative: RelativeItem) => void;
  onStartDeleting: (key: string) => void;
};

export const RelativesSection = ({
  sectionKey,
  title,
  items,
  extendedFamily,
  emptyMessage,
  isCollapsed,
  onToggleCollapsed,
  onFocusPerson,
  resolveExtendedLabel,
  isSavingRelationship,
  onStartEditing,
  onStartDeleting
}: RelativesSectionProps) => {
  const extendedMembers = extendedFamily ?? [];
  const totalCount = items.length + extendedMembers.length;
  const hasExtendedFamily = extendedMembers.length > 0;
  const contentId = `person-detail-section-content-${sectionKey}`;

  return (
    <div className="person-detail-section stack">
      <div className="person-detail-section-header">
        <button
          type="button"
          className="person-detail-section-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <h3>{title}</h3>
          <span className="person-detail-section-toggle-indicator" aria-hidden="true">
            {isCollapsed ? "▸" : "▾"}
          </span>
        </button>
        <span className="person-detail-count">{totalCount}</span>
      </div>
      <div id={contentId} className="stack" hidden={isCollapsed} style={isCollapsed ? { display: "none" } : undefined}>
        {items.length > 0 ? (
          <ul className="relatives-list">
            {items.map((relative) => (
              <li key={relative.key} className="relative-card">
                <div className="relative-main">
                  <div className="relative-summary">
                    <img
                      className="relative-avatar"
                      src={personThumbnailUrl(relative.relatedId)}
                      alt={relative.relatedName}
                    />
                    <button
                      type="button"
                      className="text-link-button relative-name-button"
                      onClick={() => onFocusPerson(relative.relatedId)}
                    >
                      {relative.relatedName}
                    </button>
                    <span className="relative-pill">{relative.relationshipLabel}</span>
                  </div>
                </div>
                <div className="relative-actions">
                  <button
                    type="button"
                    className="icon-action-button"
                    disabled={isSavingRelationship}
                    onClick={() => onStartEditing(relative)}
                    aria-label={`Edit relationship with ${relative.relatedName}`}
                    title={`Edit relationship with ${relative.relatedName}`}
                  >
                    <span aria-hidden="true">✏</span>
                  </button>
                  <button
                    type="button"
                    className="icon-action-button danger-ghost-button"
                    disabled={isSavingRelationship}
                    onClick={() => onStartDeleting(relative.key)}
                    aria-label={`Remove relationship with ${relative.relatedName}`}
                    title={`Remove relationship with ${relative.relatedName}`}
                  >
                    <span aria-hidden="true">🗑</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : emptyMessage && !hasExtendedFamily ? (
          <p className="hint">{emptyMessage}</p>
        ) : null}
        {hasExtendedFamily ? (
          <ul className="relatives-list">
            {extendedMembers.map((member) => (
              <li key={`ext:${member.personId}:${member.label}`} className="relative-card">
                <div className="relative-main">
                  <div className="relative-summary">
                    <img
                      className="relative-avatar"
                      src={personThumbnailUrl(member.personId)}
                      alt={member.personName}
                    />
                    <button
                      type="button"
                      className="text-link-button relative-name-button"
                      onClick={() => onFocusPerson(member.personId)}
                    >
                      {member.personName}
                    </button>
                    <span className="relative-pill">
                      {resolveExtendedLabel ? resolveExtendedLabel(member) : member.label}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};
