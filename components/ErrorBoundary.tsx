"use client";

import { Component, type ReactNode } from "react";

/**
 * Catches render-time errors in a subtree and shows the message instead of
 * letting the whole page white-screen. Used to isolate the admin Sync report so
 * a single bad entity/event can't take down the page.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary caught:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm">
          <p className="font-medium text-rose-800">
            {this.props.label ?? "This section"} hit an error and couldn’t render.
          </p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-rose-700">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-lg bg-rust px-3 py-1.5 text-xs font-medium text-white hover:bg-rust/90"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
