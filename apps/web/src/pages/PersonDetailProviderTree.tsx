import type { ReactNode } from "react";
import { PersonDetailProvider } from "./PersonDetailContext";

/**
 * Single mount point for all person-detail React contexts.
 * Add sibling providers here (each with a memoised value) so the people page shell stays thin.
 */
export const PersonDetailProviderTree = ({ children }: { children: ReactNode }) => (
  <PersonDetailProvider>{children}</PersonDetailProvider>
);
