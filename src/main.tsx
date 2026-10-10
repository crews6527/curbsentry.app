import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { CurbApp } from "./components/CurbApp";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    if (this.state.error)
      return (
        <main className="mx-auto max-w-xl p-6">
          <h1 className="text-2xl font-semibold">CurbSentry needs attention</h1>
          <p role="alert" className="mt-4">
            {this.state.error}
          </p>
          <p className="mt-4">
            Your saved browser log has not been cleared. Reload to try again.
          </p>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <CurbApp />
  </ErrorBoundary>,
);
