import { useEffect, useMemo, useState } from "react";
import type {
  DescendantReportResponse,
  FamilyGroupSheetResponse,
  FamilyRecord,
  PedigreeReportResponse,
  Person,
  RegisterReportResponse
} from "../../lib/api";
import {
  fetchDescendantReport,
  fetchFamilyGroupSheetReport,
  fetchPedigreeReport,
  fetchRegisterReport,
  getFamilies,
  getFamiliesForPerson
} from "../../lib/api";
import { getPersonDisplayLabel } from "../../lib/personDisplay";

type ReportKind = "pedigree" | "descendants" | "family-group" | "register";
type ReportResult =
  | PedigreeReportResponse
  | DescendantReportResponse
  | FamilyGroupSheetResponse
  | RegisterReportResponse;

type Props = {
  people: Person[];
  selectedPersonId: string | null;
};

const reportLabels: Record<ReportKind, string> = {
  pedigree: "Pedigree chart",
  descendants: "Descendant chart",
  "family-group": "Family group sheet",
  register: "Register narrative"
};

const personName = (people: Person[], personId: string | null | undefined) => {
  const person = people.find((p) => p.id === personId);
  return person ? getPersonDisplayLabel(person) : (personId ?? "Unknown");
};

const familyLabel = (family: FamilyRecord, people: Person[]) => {
  const parents = [family.parent1PersonId, family.parent2PersonId]
    .filter(Boolean)
    .map((id) => personName(people, id));
  return parents.length > 0 ? parents.join(" + ") : `Family ${family.id.slice(0, 8)}`;
};

const EventList = ({
  events
}: {
  events: ReportResult extends never ? never : PedigreeReportResponse["root"]["events"];
}) => (
  <ul className="report-event-list">
    {events.map((event) => (
      <li key={event.id}>
        <strong>{event.label}</strong>
        {event.dateDisplay ? `, ${event.dateDisplay}` : ""}
        {event.placeDisplay ? `, ${event.placeDisplay}` : ""}
        {event.citations.length > 0
          ? ` (${event.citations.length} source${event.citations.length === 1 ? "" : "s"})`
          : ""}
      </li>
    ))}
  </ul>
);

const PersonCard = ({ person }: { person: PedigreeReportResponse["root"] }) => (
  <article className="report-person-card">
    <h4>{person.displayName}</h4>
    <p className="hint">{person.isRedacted ? "Living person details redacted" : person.gender}</p>
    <EventList events={person.events.slice(0, 4)} />
  </article>
);

const ReportShell = ({ report, children }: { report: ReportResult; children: React.ReactNode }) => (
  <section className="report-print-frame">
    <div className="report-title-page">
      <h2>{reportLabels[report.type]}</h2>
      <p className="hint">
        Generated {new Date(report.generatedAt).toLocaleString()} | Redact living:{" "}
        {report.parameters.redactLiving ? "yes" : "no"}
      </p>
      {report.warnings.length > 0 ? (
        <ul className="report-warning-list">
          {report.warnings.map((warning, index) => (
            <li key={`${warning.code}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
    {children}
  </section>
);

export const PedigreeReportView = ({ report }: { report: PedigreeReportResponse }) => (
  <ReportShell report={report}>
    <div className="pedigree-report-grid">
      {report.generations.map((generation) => (
        <section key={generation.generation} className="report-generation">
          <h3>Generation {generation.generation}</h3>
          {generation.people.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </section>
      ))}
    </div>
  </ReportShell>
);

export const DescendantReportView = ({ report }: { report: DescendantReportResponse }) => (
  <ReportShell report={report}>
    {report.generations.map((generation) => (
      <section key={generation.generation} className="report-section">
        <h3>Generation {generation.generation}</h3>
        {generation.families.map((family, index) => (
          <article key={`${family.familyId ?? "fallback"}-${index}`} className="report-family-block">
            <p>
              <strong>Parents:</strong>{" "}
              {family.parents.map((person) => person.displayName).join(", ") || "Unknown"}
            </p>
            <ul>
              {family.children.map((child) => (
                <li key={child.person.id}>
                  {child.person.displayName}
                  {child.pedigree ? ` (${child.pedigree.toLowerCase()})` : ""}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    ))}
  </ReportShell>
);

export const FamilyGroupSheetView = ({ report }: { report: FamilyGroupSheetResponse }) => (
  <ReportShell report={report}>
    <section className="report-section">
      <h3>Parents</h3>
      <div className="report-card-grid">
        {report.family.parents.map((person) => (
          <PersonCard key={person.id} person={person} />
        ))}
      </div>
      <h3>Children</h3>
      <table className="report-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Pedigree</th>
            <th>Events</th>
          </tr>
        </thead>
        <tbody>
          {report.family.children.map((child) => (
            <tr key={child.person.id}>
              <td>{child.person.displayName}</td>
              <td>{child.pedigree ?? ""}</td>
              <td>{child.person.events.map((event) => event.label).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Family Events</h3>
      <EventList events={report.family.events} />
      {report.family.notes ? <p>{report.family.notes}</p> : null}
    </section>
  </ReportShell>
);

export const RegisterReportView = ({ report }: { report: RegisterReportResponse }) => (
  <ReportShell report={report}>
    {report.sections.map((section) => (
      <article key={section.number} className="report-section">
        <h3>
          {section.number}. {section.person.displayName}
        </h3>
        {section.familySummaries.map((summary) => (
          <p key={summary} className="hint">
            {summary}
          </p>
        ))}
        {section.prose.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </article>
    ))}
  </ReportShell>
);

const renderReport = (report: ReportResult) => {
  switch (report.type) {
    case "pedigree":
      return <PedigreeReportView report={report} />;
    case "descendants":
      return <DescendantReportView report={report} />;
    case "family-group":
      return <FamilyGroupSheetView report={report} />;
    case "register":
      return <RegisterReportView report={report} />;
  }
};

export const ReportsWorkspace = ({ people, selectedPersonId }: Props) => {
  const [reportKind, setReportKind] = useState<ReportKind>("pedigree");
  const [rootPersonId, setRootPersonId] = useState(selectedPersonId ?? people[0]?.id ?? "");
  const [familyId, setFamilyId] = useState("");
  const [families, setFamilies] = useState<FamilyRecord[]>([]);
  const [depth, setDepth] = useState(4);
  const [redactLiving, setRedactLiving] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPersonId) {
      setRootPersonId(selectedPersonId);
    }
  }, [selectedPersonId]);

  useEffect(() => {
    const controller = new AbortController();
    const load = selectedPersonId
      ? getFamiliesForPerson(selectedPersonId, { signal: controller.signal })
      : getFamilies({ signal: controller.signal });
    load
      .then((rows) => {
        setFamilies(rows);
        if (!familyId && rows[0]) {
          setFamilyId(rows[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Could not load families");
        }
      });
    return () => controller.abort();
  }, [familyId, selectedPersonId]);

  const sortedPeople = useMemo(
    () =>
      [...people].sort((left, right) =>
        getPersonDisplayLabel(left).localeCompare(getPersonDisplayLabel(right))
      ),
    [people]
  );

  const canGenerate = reportKind === "family-group" ? familyId.length > 0 : rootPersonId.length > 0;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const options = { depth, redactLiving };
      const next =
        reportKind === "pedigree"
          ? await fetchPedigreeReport(rootPersonId, options)
          : reportKind === "descendants"
            ? await fetchDescendantReport(rootPersonId, options)
            : reportKind === "register"
              ? await fetchRegisterReport(rootPersonId, options)
              : await fetchFamilyGroupSheetReport(familyId, { redactLiving });
      setReport(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-main-stack workspace-main-stack--secondary reports-workspace">
      <section className="card stack workspace-intro-card report-controls print-hidden">
        <div className="stack">
          <h2>Reports workspace</h2>
          <p className="hint">Generate structured genealogy reports, then use browser print to save PDF.</p>
        </div>
        {error ? <p className="hint hint--danger">{error}</p> : null}
        <div className="report-control-grid">
          <label>
            Report
            <select value={reportKind} onChange={(event) => setReportKind(event.target.value as ReportKind)}>
              {Object.entries(reportLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {reportKind === "family-group" ? (
            <label>
              Family
              <select value={familyId} onChange={(event) => setFamilyId(event.target.value)}>
                <option value="">Select family</option>
                {families.map((family) => (
                  <option key={family.id} value={family.id}>
                    {familyLabel(family, people)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Root person
                <select value={rootPersonId} onChange={(event) => setRootPersonId(event.target.value)}>
                  {sortedPeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {getPersonDisplayLabel(person)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Depth
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={depth}
                  onChange={(event) => setDepth(Number(event.target.value))}
                />
              </label>
            </>
          )}
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={redactLiving}
              onChange={(event) => setRedactLiving(event.target.checked)}
            />
            Redact living
          </label>
        </div>
        <div className="workspace-action-row">
          <button
            type="button"
            className="primary-button"
            disabled={!canGenerate || busy}
            onClick={() => void generate()}
          >
            {busy ? "Generating..." : "Generate report"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!report}
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>
      </section>
      {report ? (
        renderReport(report)
      ) : (
        <p className="hint">Choose report options and generate to preview printable output.</p>
      )}
    </section>
  );
};
