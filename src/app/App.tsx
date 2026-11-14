import { Suspense, lazy } from "solid-js";
import "./App.css";

const WorkspaceShell = lazy(async () => {
  const module = await import("../features/workspace/WorkspaceShell");
  return { default: module.WorkspaceShell };
});

const FileBrowserHarness = lazy(async () => {
  const module = await import("../features/file-view/FileBrowserHarness");
  return { default: module.FileBrowserHarness };
});

export default function App() {
  const Component = window.location.search.includes("harness=file-browser")
    ? FileBrowserHarness
    : WorkspaceShell;

  return (
    <Suspense fallback={<main />}>
      <Component />
    </Suspense>
  );
}
