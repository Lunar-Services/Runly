import { ViewTransition } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="runly-page" exit="runly-page" default="none">
      <div className="route-view">{children}</div>
    </ViewTransition>
  );
}
