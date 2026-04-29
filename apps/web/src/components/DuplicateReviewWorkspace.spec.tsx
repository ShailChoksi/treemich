import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateReviewWorkspace } from "./DuplicateReviewWorkspace";
import type { PersonDuplicateCandidateRecord } from "../lib/api";

const reactTestEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const candidate = (
  overrides: Partial<PersonDuplicateCandidateRecord> = {}
): PersonDuplicateCandidateRecord => ({
  id: "dup-1",
  personAId: "p1",
  personBId: "p2",
  score: 85,
  reasons: [{ code: "name", label: "Same full name", weight: 45 }],
  status: "PENDING",
  dismissedAt: null,
  mergedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  personA: {
    id: "p1",
    label: "Alex Smith",
    givenName: "Alex",
    surname: "Smith",
    birthDate: "1900",
    deathDate: null,
    externalIdentityCount: 1
  },
  personB: {
    id: "p2",
    label: "Alexander Smith",
    givenName: "Alexander",
    surname: "Smith",
    birthDate: "1900",
    deathDate: null,
    externalIdentityCount: 0
  },
  ...overrides
});

describe("DuplicateReviewWorkspace", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("renders pending candidates and opens either person", async () => {
    const onOpenPerson = vi.fn();

    await act(async () => {
      root.render(
        createElement(DuplicateReviewWorkspace, {
          candidates: [candidate()],
          loading: false,
          onRefresh: vi.fn(),
          onRecompute: vi.fn(),
          onDismiss: vi.fn(),
          onMerge: vi.fn(),
          onOpenPerson
        })
      );
    });

    expect(host.textContent).toContain("Alex Smith / Alexander Smith");
    expect(host.textContent).toContain("Score 85");

    const buttons = [...host.querySelectorAll("button")];
    buttons.find((button) => button.textContent === "Open second")?.click();
    expect(onOpenPerson).toHaveBeenCalledWith("p2");
  });

  it("dismisses and merges selected canonical person", async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    const onMerge = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: vi.fn().mockReturnValue(true)
    });

    await act(async () => {
      root.render(
        createElement(DuplicateReviewWorkspace, {
          candidates: [candidate()],
          loading: false,
          onRefresh: vi.fn(),
          onRecompute: vi.fn(),
          onDismiss,
          onMerge,
          onOpenPerson: vi.fn()
        })
      );
    });

    const select = host.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "p2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const buttons = [...host.querySelectorAll("button")];
    await act(async () => {
      buttons.find((button) => button.textContent === "Dismiss")?.click();
    });
    expect(onDismiss).toHaveBeenCalledWith("dup-1");

    await act(async () => {
      buttons.find((button) => button.textContent === "Merge")?.click();
    });
    expect(onMerge).toHaveBeenCalledWith("dup-1", "p2", "p1");
  });
});
