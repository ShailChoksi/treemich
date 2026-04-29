/**
 * @file React error boundary with fallback UI for graph or panel subtree failures.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  fallback: ReactNode;
  children: ReactNode;
  /** Logged with the error in `componentDidCatch` (e.g. `"App shell"` vs `"Graph"`). */
  errorContext?: string;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(this.props.errorContext ?? "React subtree", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
