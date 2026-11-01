/**
 * Canonical order model for the PA6 checkout saga orchestrator.
 *
 * Defines the shared types used across the saga lifecycle: the inbound
 * checkout request, individual line items, trace records for each step,
 * and the terminal checkout response returned to the caller.
 */

// ------------------------------------------------------------------ items ---

/** One line item within an order submitted for checkout. */
export interface CheckoutItem {
  /** Stock-keeping unit identifier for the product. */
  sku: string;
  /** Number of units of this SKU on the order (≥ 1). */
  quantity: number;
  /** Unit price of one item in the order currency (≥ 0). */
  price: number;
}

// --------------------------------------------------------- request / body ---

/** The order payload accepted by POST /checkout. */
export interface CheckoutRequest {
  /** Caller-supplied unique identifier for the order. */
  orderId: string;
  /** Identifier of the customer placing the order (optional). */
  customerId?: string;
  /** Email address for the notification step. */
  recipient: string;
  /** Ordered line items — at least one, capped at 50. */
  items: CheckoutItem[];
  /** Total order amount passed to payment authorization. */
  amount: number;
}

// ----------------------------------------------------------------- trace ---

/** Outcome of a single saga step. */
export type StepStatus = "success" | "failed" | "timeout";

/**
 * Record of one saga step as it actually executed, in wall-clock order.
 * Compensation steps (inventory_release, payment_refund) use the same shape.
 */
export interface TraceItem {
  /** Step name: payment, inventory, shipping, notification, inventory_release, or payment_refund. */
  step: string;
  /** Outcome of the step. */
  status: StepStatus;
  /** ISO-8601 timestamp recorded immediately before the downstream call. */
  startedAt: string;
  /** ISO-8601 timestamp recorded immediately after the downstream call returns or times out. */
  finishedAt: string;
  /** Wall-clock duration of the step in milliseconds. */
  durationMs: number;
}

// ------------------------------------------------------------ response ---

/** Terminal saga state. */
export type SagaStatus = "completed" | "compensated" | "failed";

/**
 * Machine-readable reason codes attached to non-completed outcomes.
 *
 * - `timeout`              — a downstream call exceeded REQUEST_TIMEOUT_MS
 * - `compensation_failed`  — at least one compensation step also failed
 */
export type ErrorCode =
  | "timeout"
  | "compensation_failed"
  | "idempotency_conflict"
  | "idempotency_payload_mismatch"
  | "validation_error";

/** Result returned by POST /checkout once the saga reaches a terminal state. */
export interface CheckoutResponse {
  /** Echoes the orderId from the request body. */
  orderId: string;
  /** Terminal saga state. */
  status: SagaStatus;
  /** Machine-readable reason code (present on non-completed outcomes). */
  code?: string;
  /** Ordered record of every step the saga ran, including compensation steps. */
  trace: TraceItem[];
}

// -------------------------------------------------------- error response ---

/** Machine-readable error shape for 400 and 409 responses. */
export interface ErrorResponse {
  /** Stable machine-readable code. */
  code: ErrorCode | string;
  /** Human-readable explanation. */
  message: string;
}

// ------------------------------------------------------ idempotency store ---

/** Possible states for an idempotency record. */
export type IdempotencyState = "in_progress" | "completed" | "failed" | "compensated";

/** One entry in the idempotency store keyed by Idempotency-Key header. */
export interface IdempotencyRecord {
  /** SHA-256 hash of the request payload for mismatch detection. */
  requestHash: string;
  /** Current lifecycle state. */
  state: IdempotencyState;
  /** HTTP status code of the final response (or 202 while in-progress). */
  httpStatus: number;
  /** The full response body to replay on subsequent identical requests. */
  response: unknown;
  /** ISO-8601 timestamp of the last update to this record. */
  updatedAt: string;
}

// ----------------------------------------------------------- saga store ---

/** One entry in the saga store keyed by orderId. */
export interface SagaRecord {
  /** The idempotency key that initiated this saga. */
  idempotencyKey: string;
  /** Terminal saga state. */
  state: SagaStatus;
  /** Ordered trace of all executed steps. */
  steps: TraceItem[];
  /** ISO-8601 timestamp of the last update to this record. */
  updatedAt: string;
}
