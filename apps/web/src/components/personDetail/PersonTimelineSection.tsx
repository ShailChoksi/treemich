/**
 * @file Chronological timeline for the selected person.
 */

import { lifeEventTypeUiGlyph } from "@treemich/shared";
import { useState } from "react";
import type { TimelineEventRecord } from "../../lib/api";
import { summarizeLifeEvent } from "../../lib/lifeEventFormHelpers";

type Props = {
  timeline: TimelineEventRecord[] | undefined;
};

export const PersonTimelineSection = ({ timeline }: Props) => {
  const [search, setSearch] = useState("");

  if (timeline === undefined) {
    return <p className="hint">Loading timeline…</p>;
  }
  if (timeline.length === 0) {
    return <p className="hint">No dated life events yet.</p>;
  }

  const filtered = timeline.filter((event) =>
    search.trim().length > 0
      ? summarizeLifeEvent(event).toLowerCase().includes(search.trim().toLowerCase())
      : true
  );
  const byYear = new Map<string, TimelineEventRecord[]>();
  for (const event of filtered) {
    const yearLabel = event.year != null ? String(event.year) : "Unknown year";
    if (!byYear.has(yearLabel)) {
      byYear.set(yearLabel, []);
    }
    byYear.get(yearLabel)!.push(event);
  }
  const groups = [...byYear.entries()].sort((a, b) => {
    const ay = Number(a[0]);
    const by = Number(b[0]);
    if (Number.isFinite(ay) && Number.isFinite(by)) {
      return ay - by;
    }
    if (a[0] === "Unknown year") {
      return 1;
    }
    if (b[0] === "Unknown year") {
      return -1;
    }
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="stack">
      <input
        className="person-timeline-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Filter timeline events"
      />
      <ol className="person-timeline-list">
        {groups.map(([year, events]) => (
          <li key={year} className="person-timeline-year-group">
            <h4 className="person-timeline-year-heading">{year}</h4>
            <ul className="person-timeline-sublist">
              {events.map((event) => (
                <li key={event.id} className="person-timeline-item">
                  <span className="life-events-glyph" aria-hidden="true">
                    {lifeEventTypeUiGlyph[event.eventType]}
                  </span>
                  <span className="person-timeline-summary">{summarizeLifeEvent(event)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
};
