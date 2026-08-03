/**
 * @file Canvas overlay badge for a Focus-locked person node.
 */

import { Html } from "@react-three/drei";

export const FocusLockBadge = () => (
  <Html position={[0.52, 0.52, 0.08]} center zIndexRange={[25, 0]} style={{ pointerEvents: "none" }}>
    <span className="graph-focus-lock-badge" title="Lock Focus on Person" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </span>
  </Html>
);
