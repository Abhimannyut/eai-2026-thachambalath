/// <reference lib="dom" />
/**
 * PA6 orchestrator — contract-first checkout saga.
 *
 * Endpoints:
 *   GET  /health
 *   POST /checkout          (saga + idempotency)
 *   GET  /debug/trace/:orderId
 *
 * Saga steps (strict sequential):
 *   1) payment authorize    → POST PAYMENT_URL/payment/authorize
 *   2) inventory reserve    → POST INVENTORY_URL/inventory/reserve
 *   3) shipping create      → POST SHIPPING_URL/shipping/create
 *   4) notification send    → POST NOTIFICATION_URL/notification/send
 *
 * Compensation (reverse, only for steps that completed):
 *   inventory release  → POST INVENTORY_URL/inventory/release
 *   payment refund     → POST PAYMENT_URL/payment/refund
 *   (shipping/notification have no compensating endpoints)
 *
 * Idempotency rules:
 *   same key + same payload  → replay exact prior result
 *   same key + diff payload  → 409 idempotency_payload_mismatch
 *   same key + in-progress   → 409 idempotency_conflict
 *
 * HTTP status mapping:
 *   completed              → 200
 *   business failure       → 422
 *   compensation_failed    → 422 + code compensation_failed
 *   timeout-triggered flow → 504 + code timeout
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express, { type Request, type Response as ExpressResponse } from "express";

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

const app = express();
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// ----------------------------------------------------------------- config ---

interface Config {
  port: number;
  paymentUrl: string;
  inventoryUrl: string;
  shippingUrl: string;
  notificationUrl: string;
  requestTimeoutMs: number;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function loadConfig(): Config {
  return {
    port: Number(process.env.ORCHESTRATOR_PORT || 3000),
    paymentUrl: readRequiredEnv("PAYMENT_URL"),
    inventoryUrl: readRequiredEnv("INVENTORY_URL"),
    shippingUrl: readRequiredEnv("SHIPPING_URL"),
    notificationUrl: readRequiredEnv("NOTIFICATION_URL"),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 2500),
  };
}

const config = loadConfig();

// ----------------------------------------------------------------- stores ---

const DATA_DIR = "/data";
const IDEMPOTENCY_STORE_PATH = path.join(DATA_DIR, "idempotency-store.json");
const SAGA_STORE_PATH = path.join(DATA_DIR, "saga-store.json");

export interface TraceItem {
  step: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export type SagaState = "completed" | "failed" | "compensated";
export type IdempotencyState = "in_progress" | "completed" | "failed" | "compensated";

interface IdempotencyRecord {
  requestHash: string;
  state: IdempotencyState;
  httpStatus: number;
  response: unknown;
  updatedAt: string;
}

interface IdempotencyStore {
  records: Record<string, IdempotencyRecord>;
}

interface SagaRecord {
  idempotencyKey: string;
  state: SagaState;
  steps: TraceItem[];
  updatedAt: string;
}

interface SagaStore {
  sagas: Record<string, SagaRecord>;
}

function ensureJsonFile(filePath: string, initialData: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath))
    fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), "utf8");
}

function readJsonFile<T>(filePath: string): T {
  ensureJsonFile(filePath, {});
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw || "{}") as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function bootstrapStores(): void {
  ensureJsonFile(IDEMPOTENCY_STORE_PATH, { records: {} });
  ensureJsonFile(SAGA_STORE_PATH, { sagas: {} });
}

// --------------------------------------------------------------- helpers ---

function nowIso(): string {
  return new Date().toISOString();
}

function payloadHash(payload: unknown): string {
  const normalized = JSON.stringify(payload);
  return `sha256:${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}

function validateCheckoutPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return "Request body must be a JSON object";
  const p = payload as Record<string, unknown>;
  if (typeof p.orderId !== "string" || p.orderId.trim() === "")
    return 'Field "orderId" is required and must be a non-empty string';
  if (!Array.isArray(p.items) || p.items.length === 0)
    return 'Field "items" is required and must be a non-empty array';
  if (typeof p.amount !== "number")
    return 'Field "amount" is required and must be numeric';
  if (typeof p.recipient !== "string" || p.recipient.trim() === "")
    return 'Field "recipient" is required and must be a non-empty string';
  return null;
}

// Timeout-aware fetch: throws with .isTimeout=true when the deadline elapses.
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError" ||
        (err as NodeJS.ErrnoException).code === "UND_ERR_CONNECT_TIMEOUT" ||
        controller.signal.aborted)
    ) {
      const te = new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      (te as any).isTimeout = true;
      throw te;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Run one step of the saga; records to trace[]; throws on failure/timeout.
async function runStep(
  stepName: string,
  url: string,
  body: unknown,
  trace: TraceItem[],
  timeoutMs: number,
): Promise<unknown> {
  const startedAt = nowIso();
  const startMs = Date.now();

  let finishedAt: string;
  let durationMs: number;

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );

    finishedAt = nowIso();
    durationMs = Date.now() - startMs;

    if (!res.ok) {
      trace.push({ step: stepName, status: "failed", startedAt, finishedAt, durationMs });
      const errBody = await res.json().then((v: unknown) => v).catch(() => ({}));
      const err = new Error(`Step ${stepName} failed: ${res.status}`);
      (err as any).stepError = errBody;
      throw err;
    }

    trace.push({ step: stepName, status: "success", startedAt, finishedAt, durationMs });
    return await res.json().then((v: unknown) => v).catch(() => ({}));
  } catch (err: unknown) {
    if ((err as any).isTimeout) {
      finishedAt = nowIso();
      durationMs = Date.now() - startMs;
      trace.push({ step: stepName, status: "timeout", startedAt, finishedAt, durationMs });
      (err as any).isTimeout = true;
      throw err;
    }
    // Already pushed to trace above for non-timeout failures
    if (!(err as any).stepError && !(err as any).isTimeout) {
      finishedAt = nowIso();
      durationMs = Date.now() - startMs;
      trace.push({ step: stepName, status: "failed", startedAt, finishedAt, durationMs });
    }
    throw err;
  }
}

// Run one compensation step; records to trace[]; does NOT throw — a
// compensation failure is recorded and returned as false.
async function runCompensation(
  stepName: string,
  url: string,
  body: unknown,
  trace: TraceItem[],
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = nowIso();
  const startMs = Date.now();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
    const finishedAt = nowIso();
    const durationMs = Date.now() - startMs;
    if (!res.ok) {
      trace.push({ step: stepName, status: "failed", startedAt, finishedAt, durationMs });
      return false;
    }
    trace.push({ step: stepName, status: "success", startedAt, finishedAt, durationMs });
    return true;
  } catch {
    const finishedAt = nowIso();
    const durationMs = Date.now() - startMs;
    trace.push({ step: stepName, status: "failed", startedAt, finishedAt, durationMs });
    return false;
  }
}

// ---------------------------------------------------------------- routes ---

app.get("/health", (_req: Request, res: ExpressResponse) => {
  res.status(200).json({ status: "ok" });
});

app.get("/debug/trace/:orderId", (req: Request, res: ExpressResponse) => {
  const orderId = req.params.orderId ?? "";
  const sagaStore = readJsonFile<SagaStore>(SAGA_STORE_PATH);
  const saga = sagaStore?.sagas?.[orderId];
  if (!saga) {
    res.status(404).json({ code: "not_found", message: "No saga found for this orderId" });
    return;
  }
  res.status(200).json(saga);
});

app.post("/checkout", (req: Request, res: ExpressResponse) => {
  // ---- header validation ----
  const idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey) {
    res.status(400).json({ code: "validation_error", message: "Idempotency-Key header is required" });
    return;
  }

  // ---- body validation ----
  const validationError = validateCheckoutPayload(req.body);
  if (validationError) {
    res.status(400).json({ code: "validation_error", message: validationError });
    return;
  }

  const orderId: string = (req.body as Record<string, unknown>).orderId as string;
  const requestHash = payloadHash(req.body);

  const idempotencyStore = readJsonFile<IdempotencyStore>(IDEMPOTENCY_STORE_PATH);
  if (!idempotencyStore.records) idempotencyStore.records = {};

  const existing = idempotencyStore.records[idempotencyKey];

  // ---- idempotency: payload mismatch ----
  if (existing && existing.requestHash !== requestHash) {
    res.status(409).json({
      code: "idempotency_payload_mismatch",
      message: "This Idempotency-Key is already used for a different payload",
    });
    return;
  }

  // ---- idempotency: in-flight conflict ----
  if (existing && existing.state === "in_progress") {
    res.status(409).json({
      code: "idempotency_conflict",
      message: "A request with this Idempotency-Key is still in progress",
    });
    return;
  }

  // ---- idempotency: replay completed/failed/compensated ----
  if (existing && existing.state !== "in_progress") {
    res.status(existing.httpStatus).json(existing.response);
    return;
  }

  // ---- mark in-progress ----
  idempotencyStore.records[idempotencyKey] = {
    requestHash,
    state: "in_progress",
    httpStatus: 202,
    response: { orderId, status: "in_progress" },
    updatedAt: nowIso(),
  };
  writeJsonFile(IDEMPOTENCY_STORE_PATH, idempotencyStore);

  // ---- run the saga asynchronously so we can send res at the end ----
  void (async () => {
    const trace: TraceItem[] = [];
    const payload = req.body as {
      orderId: string;
      amount: number;
      items: unknown[];
      recipient: string;
    };

    // Track which steps completed so we know what to compensate.
    let paymentDone = false;
    let inventoryDone = false;

    let finalHttpStatus = 200;
    let finalCode: string | undefined;
    let sagaState: SagaState = "completed";
    let isTimeout = false;

    try {
      // Step 1 — payment authorize
      await runStep(
        "payment",
        `${config.paymentUrl}/payment/authorize`,
        { orderId: payload.orderId, amount: payload.amount },
        trace,
        config.requestTimeoutMs,
      );
      paymentDone = true;

      // Step 2 — inventory reserve
      await runStep(
        "inventory",
        `${config.inventoryUrl}/inventory/reserve`,
        { orderId: payload.orderId, items: payload.items },
        trace,
        config.requestTimeoutMs,
      );
      inventoryDone = true;

      // Step 3 — shipping create
      await runStep(
        "shipping",
        `${config.shippingUrl}/shipping/create`,
        { orderId: payload.orderId },
        trace,
        config.requestTimeoutMs,
      );

      // Step 4 — notification send
      await runStep(
        "notification",
        `${config.notificationUrl}/notification/send`,
        { orderId: payload.orderId, recipient: payload.recipient },
        trace,
        config.requestTimeoutMs,
      );

      // All steps succeeded
      sagaState = "completed";
      finalHttpStatus = 200;
    } catch (err: unknown) {
      isTimeout = !!(err as any).isTimeout;

      // Compensate in reverse order: inventory first, then payment
      let compensationFailed = false;

      if (inventoryDone) {
        const ok = await runCompensation(
          "inventory_release",
          `${config.inventoryUrl}/inventory/release`,
          { orderId: payload.orderId },
          trace,
          config.requestTimeoutMs,
        );
        if (!ok) compensationFailed = true;
      }

      if (paymentDone) {
        const ok = await runCompensation(
          "payment_refund",
          `${config.paymentUrl}/payment/refund`,
          { orderId: payload.orderId },
          trace,
          config.requestTimeoutMs,
        );
        if (!ok) compensationFailed = true;
      }

      if (compensationFailed) {
        sagaState = "failed";
        finalHttpStatus = 422;
        finalCode = "compensation_failed";
      } else if (isTimeout) {
        sagaState = "compensated";
        finalHttpStatus = 504;
        finalCode = "timeout";
      } else {
        sagaState = "compensated";
        finalHttpStatus = 422;
        finalCode = undefined;
      }
    }

    // Build response body
    const responseBody: Record<string, unknown> = {
      orderId,
      status: sagaState,
      trace,
    };
    if (finalCode) responseBody.code = finalCode;

    // Persist saga
    const sagaStore = readJsonFile<SagaStore>(SAGA_STORE_PATH);
    if (!sagaStore.sagas) sagaStore.sagas = {};
    sagaStore.sagas[orderId] = {
      idempotencyKey,
      state: sagaState,
      steps: trace,
      updatedAt: nowIso(),
    };
    writeJsonFile(SAGA_STORE_PATH, sagaStore);

    // Persist idempotency record with final state
    const finalIdempotencyState: IdempotencyState =
      sagaState === "completed" ? "completed" : sagaState === "compensated" ? "compensated" : "failed";

    const iStore = readJsonFile<IdempotencyStore>(IDEMPOTENCY_STORE_PATH);
    if (!iStore.records) iStore.records = {};
    iStore.records[idempotencyKey] = {
      requestHash,
      state: finalIdempotencyState,
      httpStatus: finalHttpStatus,
      response: responseBody,
      updatedAt: nowIso(),
    };
    writeJsonFile(IDEMPOTENCY_STORE_PATH, iStore);

    res.status(finalHttpStatus).json(responseBody);
  })();
});

// ------------------------------------------------------------------ boot ---

bootstrapStores();

app.listen(config.port, () => {
  console.log(`[orchestrator] listening on port ${config.port}`);
  console.log("[orchestrator] downstream targets:", {
    paymentUrl: config.paymentUrl,
    inventoryUrl: config.inventoryUrl,
    shippingUrl: config.shippingUrl,
    notificationUrl: config.notificationUrl,
    requestTimeoutMs: config.requestTimeoutMs,
  });
});
