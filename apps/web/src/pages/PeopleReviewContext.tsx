import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  CreateResearchTaskBody,
  PersonDuplicateCandidateRecord,
  ResearchTaskRecord,
  ValidationFindingRecord
} from "../lib/api";
import {
  createResearchTask,
  deleteResearchTask,
  getDuplicateCandidates,
  getResearchTasks,
  getValidationFindings,
  mergeDuplicateCandidate,
  recomputeDuplicateCandidates,
  recomputeValidationFindings,
  updateDuplicateCandidate,
  updateResearchTask,
  updateValidationFinding
} from "../lib/api";
import { usePeopleGraphData } from "./PeopleGraphDataContext";
import { useToast } from "./ToastContext";

type PeopleReviewContextValue = {
  researchTasksByPersonId: Record<string, ResearchTaskRecord[]>;
  allResearchTasks: ResearchTaskRecord[];
  allResearchTasksLoading: boolean;
  validationFindings: ValidationFindingRecord[];
  validationFindingsLoading: boolean;
  duplicateCandidates: PersonDuplicateCandidateRecord[];
  duplicateCandidatesLoading: boolean;
  refreshAllResearchTasks: () => Promise<void>;
  refreshValidationFindings: () => Promise<void>;
  refreshDuplicateCandidates: () => Promise<void>;
  handleResearchTaskCreate: (body: CreateResearchTaskBody) => Promise<void>;
  handleResearchTaskUpdate: (
    taskId: string,
    patch: Partial<Pick<ResearchTaskRecord, "title" | "status" | "dueDate" | "notes" | "personId">>
  ) => Promise<void>;
  handleResearchTaskDelete: (taskId: string) => Promise<void>;
  handleValidationRecompute: () => Promise<void>;
  handleValidationFindingStatusChange: (
    findingId: string,
    nextStatus: "OPEN" | "IN_PROGRESS" | "DISMISSED"
  ) => Promise<void>;
  handleDuplicateRecompute: () => Promise<void>;
  handleDuplicateDismiss: (candidateId: string) => Promise<void>;
  handleDuplicateMerge: (
    candidateId: string,
    canonicalPersonId: string,
    duplicatePersonId: string
  ) => Promise<void>;
};

const PeopleReviewContext = createContext<PeopleReviewContextValue | null>(null);

export const PeopleReviewProvider = ({ children }: { children: ReactNode }) => {
  const graph = usePeopleGraphData();
  const { setStatus } = useToast();
  const { selectedPerson } = graph;
  const [researchTasksByPersonId, setResearchTasksByPersonId] = useState<
    Record<string, ResearchTaskRecord[]>
  >({});
  const [allResearchTasks, setAllResearchTasks] = useState<ResearchTaskRecord[]>([]);
  const [allResearchTasksLoading, setAllResearchTasksLoading] = useState(false);
  const [validationFindings, setValidationFindings] = useState<ValidationFindingRecord[]>([]);
  const [validationFindingsLoading, setValidationFindingsLoading] = useState(false);
  const [duplicateCandidates, setDuplicateCandidates] = useState<PersonDuplicateCandidateRecord[]>([]);
  const [duplicateCandidatesLoading, setDuplicateCandidatesLoading] = useState(false);

  useEffect(() => {
    setResearchTasksByPersonId({});
  }, [graph.dataRevision]);

  const researchForSelected = selectedPerson ? researchTasksByPersonId[selectedPerson.id] : undefined;
  useEffect(() => {
    if (!selectedPerson || researchForSelected !== undefined) {
      return;
    }
    const controller = new AbortController();
    getResearchTasks(selectedPerson.id, { signal: controller.signal })
      .then((tasks) => {
        if (!controller.signal.aborted) {
          setResearchTasksByPersonId((current) => ({ ...current, [selectedPerson.id]: tasks }));
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        setStatus(`Could not load research tasks: ${err instanceof Error ? err.message : "Unknown error"}`);
        setResearchTasksByPersonId((current) => ({ ...current, [selectedPerson.id]: [] }));
      });
    return () => controller.abort();
  }, [researchForSelected, selectedPerson, setStatus]);

  const refreshResearchTasksForSelectedPerson = useCallback(async () => {
    if (!selectedPerson) {
      return;
    }
    const tasks = await getResearchTasks(selectedPerson.id);
    setResearchTasksByPersonId((current) => ({ ...current, [selectedPerson.id]: tasks }));
  }, [selectedPerson]);

  const refreshAllResearchTasks = useCallback(async () => {
    setAllResearchTasksLoading(true);
    try {
      const tasks = await getResearchTasks();
      setAllResearchTasks(tasks);
    } finally {
      setAllResearchTasksLoading(false);
    }
  }, []);

  const refreshValidationFindings = useCallback(async () => {
    setValidationFindingsLoading(true);
    try {
      const findings = await getValidationFindings();
      setValidationFindings(findings);
    } finally {
      setValidationFindingsLoading(false);
    }
  }, []);

  const refreshDuplicateCandidates = useCallback(async () => {
    setDuplicateCandidatesLoading(true);
    try {
      const candidates = await getDuplicateCandidates({ status: "PENDING", limit: 100 });
      setDuplicateCandidates(candidates);
    } finally {
      setDuplicateCandidatesLoading(false);
    }
  }, []);

  const handleResearchTaskCreate = useCallback(
    async (body: CreateResearchTaskBody) => {
      await createResearchTask(body);
      await refreshResearchTasksForSelectedPerson();
      await refreshAllResearchTasks();
    },
    [refreshAllResearchTasks, refreshResearchTasksForSelectedPerson]
  );

  const handleResearchTaskUpdate = useCallback(
    async (
      taskId: string,
      patch: Partial<Pick<ResearchTaskRecord, "title" | "status" | "dueDate" | "notes" | "personId">>
    ) => {
      await updateResearchTask(taskId, patch);
      await refreshResearchTasksForSelectedPerson();
      await refreshAllResearchTasks();
    },
    [refreshAllResearchTasks, refreshResearchTasksForSelectedPerson]
  );

  const handleResearchTaskDelete = useCallback(
    async (taskId: string) => {
      await deleteResearchTask(taskId);
      await refreshResearchTasksForSelectedPerson();
      await refreshAllResearchTasks();
    },
    [refreshAllResearchTasks, refreshResearchTasksForSelectedPerson]
  );

  const handleValidationRecompute = useCallback(async () => {
    const result = await recomputeValidationFindings();
    setValidationFindings(result.findings);
    graph.setTreeValidationIssueCount(
      result.findings.filter((finding) => finding.status !== "RESOLVED").length
    );
    graph.setTreeValidationEngineDisabled(result.engineDisabled);
    setStatus(`Validation recomputed: ${result.summary.current} current issue(s)`);
  }, [graph, setStatus]);

  const handleValidationFindingStatusChange = useCallback(
    async (findingId: string, nextStatus: "OPEN" | "IN_PROGRESS" | "DISMISSED") => {
      await updateValidationFinding(findingId, nextStatus);
      await refreshValidationFindings();
    },
    [refreshValidationFindings]
  );

  const handleDuplicateRecompute = useCallback(async () => {
    const result = await recomputeDuplicateCandidates();
    setDuplicateCandidates(result.candidates);
    setStatus(
      `Duplicate scan complete: ${result.summary.pending} pending candidate(s), ${result.summary.created} new`
    );
  }, [setStatus]);

  const handleDuplicateDismiss = useCallback(
    async (candidateId: string) => {
      await updateDuplicateCandidate(candidateId, { status: "DISMISSED" });
      await refreshDuplicateCandidates();
    },
    [refreshDuplicateCandidates]
  );

  const handleDuplicateMerge = useCallback(
    async (candidateId: string, canonicalPersonId: string, duplicatePersonId: string) => {
      const result = await mergeDuplicateCandidate(candidateId, {
        canonicalPersonId,
        duplicatePersonId,
        confirm: true
      });
      await graph.refreshGraphData({ bypassSaveGuard: true });
      await refreshDuplicateCandidates();
      graph.setSelectedPersonId(result.canonicalPersonId);
      graph.setGraphCameraFocusPersonId(result.canonicalPersonId);
      setStatus(`Merged duplicate person into ${result.canonicalPersonId}`);
    },
    [graph, refreshDuplicateCandidates, setStatus]
  );

  const value = useMemo<PeopleReviewContextValue>(
    () => ({
      researchTasksByPersonId,
      allResearchTasks,
      allResearchTasksLoading,
      validationFindings,
      validationFindingsLoading,
      duplicateCandidates,
      duplicateCandidatesLoading,
      refreshAllResearchTasks,
      refreshValidationFindings,
      refreshDuplicateCandidates,
      handleResearchTaskCreate,
      handleResearchTaskUpdate,
      handleResearchTaskDelete,
      handleValidationRecompute,
      handleValidationFindingStatusChange,
      handleDuplicateRecompute,
      handleDuplicateDismiss,
      handleDuplicateMerge
    }),
    [
      allResearchTasks,
      allResearchTasksLoading,
      duplicateCandidates,
      duplicateCandidatesLoading,
      handleDuplicateDismiss,
      handleDuplicateMerge,
      handleDuplicateRecompute,
      handleResearchTaskCreate,
      handleResearchTaskDelete,
      handleResearchTaskUpdate,
      handleValidationFindingStatusChange,
      handleValidationRecompute,
      refreshAllResearchTasks,
      refreshDuplicateCandidates,
      refreshValidationFindings,
      researchTasksByPersonId,
      validationFindings,
      validationFindingsLoading
    ]
  );

  return <PeopleReviewContext.Provider value={value}>{children}</PeopleReviewContext.Provider>;
};

export const usePeopleReview = () => {
  const context = useContext(PeopleReviewContext);
  if (!context) {
    throw new Error("usePeopleReview must be used within PeopleReviewProvider");
  }
  return context;
};
