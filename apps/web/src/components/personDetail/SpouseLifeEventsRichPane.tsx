import type { CreateLifeEventBody, PatchLifeEventBody } from "@treemich/shared";
import type { LifeEventRecord } from "../../lib/api";
import { LifeEventRichForm } from "./LifeEventRichForm";

type Props = {
  events: LifeEventRecord[];
  onCreate: (body: CreateLifeEventBody) => Promise<void>;
  onPatch: (eventId: string, body: PatchLifeEventBody) => Promise<void>;
  onDelete: (eventId: string) => Promise<void>;
  disabled?: boolean;
};

export const SpouseLifeEventsRichPane = ({
  events,
  onCreate,
  onPatch,
  onDelete,
  disabled
}: Props) => {
  const marriage = events.find((e) => e.eventType === "MARRIAGE") ?? null;
  const divorce = events.find((e) => e.eventType === "DIVORCE") ?? null;

  return (
    <div className="spouse-life-events-rich stack">
      <p className="hint">
        Advanced fields for marriage and divorce life events (partial dates, qualifiers, notes, place, citations).
        Quick anniversary/divorce dates above still update the same events when saved.
      </p>
      <details className="spouse-life-events-details">
        <summary className="field-label">Marriage event (advanced)</summary>
        {marriage ? (
          <div className="stack">
            <LifeEventRichForm
              variant="edit"
              initialEvent={marriage}
              fixedEventType="MARRIAGE"
              onSubmitCreate={() => Promise.resolve()}
              onSubmitPatch={(id, body) => onPatch(id, body)}
              onDelete={(id) => onDelete(id)}
              onCancel={() => undefined}
              disabled={disabled}
            />
          </div>
        ) : (
          <LifeEventRichForm
            variant="create"
            fixedEventType="MARRIAGE"
            onSubmitCreate={(body) => onCreate(body)}
            onSubmitPatch={() => Promise.resolve()}
            onCancel={() => undefined}
            disabled={disabled}
          />
        )}
      </details>
      <details className="spouse-life-events-details">
        <summary className="field-label">Divorce event (advanced)</summary>
        {divorce ? (
          <div className="stack">
            <LifeEventRichForm
              variant="edit"
              initialEvent={divorce}
              fixedEventType="DIVORCE"
              onSubmitCreate={() => Promise.resolve()}
              onSubmitPatch={(id, body) => onPatch(id, body)}
              onDelete={(id) => onDelete(id)}
              onCancel={() => undefined}
              disabled={disabled}
            />
          </div>
        ) : (
          <LifeEventRichForm
            variant="create"
            fixedEventType="DIVORCE"
            onSubmitCreate={(body) => onCreate(body)}
            onSubmitPatch={() => Promise.resolve()}
            onCancel={() => undefined}
            disabled={disabled}
          />
        )}
      </details>
    </div>
  );
};
