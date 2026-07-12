// The four telemetry event types, EXACTLY per constraint-enforcement-spec.md
// Section 6. Every event carries the shared envelope plus type-specific
// fields. Browser-safe: no node imports anywhere in this file.

export type EventContext = "consumer-web" | "enterprise-saas" | "dashboard";

export interface EventEnvelope {
  componentName: string;
  variantName: string;
  context: EventContext;
  sessionId: string;
  timestamp: number;
}

/** Fired on user interaction with the component. */
export interface ComponentInteractionEvent extends EventEnvelope {
  type: "component-interaction";
  interactionType: string;
  targetProperty: string;
}

/** Fired on validation errors, failed interactions, and rejected input. */
export interface ComponentErrorEvent extends EventEnvelope {
  type: "component-error";
  errorClass: string;
  recovered: boolean;
}

/** Fired by the host page when a flow containing the component resolves. */
export interface TaskCompletionEvent extends EventEnvelope {
  type: "task-completion";
  taskId: string;
  durationMs: number;
  completed: boolean;
}

/** Fired when a user interacts with the component and exits the flow without completion. */
export interface ComponentAbandonmentEvent extends EventEnvelope {
  type: "component-abandonment";
  dwellMs: number;
}

export type TelemetryEvent =
  | ComponentInteractionEvent
  | ComponentErrorEvent
  | TaskCompletionEvent
  | ComponentAbandonmentEvent;

export type TelemetryEventType = TelemetryEvent["type"];

/** Mirrors component-definition.schema.json's evolution.gate.metric enum. */
export type GateMetric =
  | "task-completion-rate"
  | "interaction-error-rate"
  | "time-to-interaction"
  | "abandonment-rate";
