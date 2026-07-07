'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When this value changes, the boundary clears a prior error and retries. */
  resetKey?: unknown;
  /** Rendered instead of children while in an error state. */
  fallback?: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Keeps a render error in one subtree (e.g. the overlay) from taking down the
 * whole page. Critical for the stream view: the camera + outgoing broadcast
 * must survive even if the overlay hits a bad state. Auto-recovers when
 * `resetKey` changes (i.e. the next state update).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Surface for debugging without crashing the tree.
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label || 'ErrorBoundary'}]`, error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
