"use client";

import dynamic from "next/dynamic";
import type { WorkspaceView } from "@/lib/workspace-ui-fixtures";
import styles from "./workspace-client.module.css";

const Workspace = dynamic(
  () => import("./workspace-ui").then((module) => module.WorkspaceUI),
  {
    ssr: false,
    loading: () => (
      <main
        className={styles.loading}
        aria-busy="true"
        aria-label="Loading workspace"
      >
        <p role="status">Opening your workspace…</p>
      </main>
    ),
  },
);

export function WorkspaceClient({
  initialView = "new",
  projectId,
}: {
  initialView?: WorkspaceView;
  projectId?: string;
}) {
  return (
    <Workspace
      key={`${initialView}:${projectId || "preview"}`}
      initialView={initialView}
      projectId={projectId}
    />
  );
}
