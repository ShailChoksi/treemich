/**
 * @file Accessible collapsible section; subtitle only when expanded.
 */

import type { ReactNode } from "react";

type CollapsibleSectionProps = {
  sectionKey: string;
  title: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  count?: string | number;
  subtitle?: string;
  infoTooltip?: string;
  className?: string;
  children: ReactNode;
};

export const CollapsibleSection = ({
  sectionKey,
  title,
  isCollapsed,
  onToggleCollapsed,
  count,
  subtitle,
  infoTooltip,
  className,
  children
}: CollapsibleSectionProps) => {
  const contentId = `person-detail-section-content-${sectionKey}`;
  const sectionClassName = className ? `${className} stack` : "person-detail-section stack";
  return (
    <div className={sectionClassName}>
      <div className="person-detail-section-header">
        <button
          type="button"
          className="person-detail-section-toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
          aria-controls={contentId}
        >
          <div className="stack">
            <div className="person-detail-section-title-row">
              <h3>{title}</h3>
              {infoTooltip ? (
                <span
                  className="person-detail-section-info"
                  title={infoTooltip}
                  aria-label={`Info: ${infoTooltip}`}
                >
                  ?
                </span>
              ) : null}
            </div>
            {subtitle && !isCollapsed ? <p className="hint">{subtitle}</p> : null}
          </div>
          <span className="person-detail-section-toggle-indicator" aria-hidden="true">
            {isCollapsed ? "▸" : "▾"}
          </span>
        </button>
        {count !== undefined ? <span className="person-detail-count">{count}</span> : null}
      </div>
      {isCollapsed ? null : (
        <div id={contentId} className="stack">
          {children}
        </div>
      )}
    </div>
  );
};
