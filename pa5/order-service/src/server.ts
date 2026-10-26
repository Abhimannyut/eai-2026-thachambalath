/**
 * PA5 order-service — HTTP producer.
 * POST /orders  → publishes to orders.exchange fanout, stores in memory, returns 201.
 * GET  /orders/:correlationId → fetch stored order.
 * GET  /health → { status: "ok" }
 */

import express from "express";
import { connectWithRetry } from "../../shared/rabbit";
import type { CanonicalOrder } from "../../shared/canonical-order";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// In-memory store: correlationId → order
const orders = new Map<string, CanonicalOrder>();

async function main(): Promise<void> {
  const { channel } = await connectWithRetry(process.env.RABBITMQ_URL!);

  const app = express();
  app.use(express.json());

  // POST /orders
  app.post("/orders", (req, res) => {
    const order = req.body as CanonicalOrder;

    // Basic validation
    if (!order || !order.orderId) {
      res.status(400).json({ error: "Invalid order body" });
      return;
    }

    const correlationId = (crypto as Crypto).randomUUID();

    // Publish to fanout exchange — exchange first, routing key "" (ignored by fanout)
    channel.publish(
      "orders.exchange",
      "",
      Buffer.from(JSON.stringify(order)),
      {
        headers: { correlationId },
        contentType: "application/json",
      }
    );

    // Store in memory keyed by correlationId
    orders.set(correlationId, order);

    console.log(`[order-service] Accepted order ${order.orderId} correlationId=${correlationId}`);

    res.status(201).json({ correlationId, status: "accepted" });
  });

  // GET /orders/:correlationId
  app.get("/orders/:correlationId", (req, res) => {
    const { correlationId } = req.params;
    const order = orders.get(correlationId);
    if (!order) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(200).json({ correlationId, order });
  });

  // GET /health
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(PORT, () => {
    console.log(`[order-service] Listening on port ${PORT}`);
  });
}

main().catch(console.error);
