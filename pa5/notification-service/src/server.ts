/**
 * PA5 notification-service — idempotent consumer.
 * Persists processed correlationIds to /data/processed-ids.json so
 * duplicates (from the retry topology's redelivery) are silently skipped.
 */

import fs from "fs";
import type { ConsumeMessage } from "amqplib";
import { connectWithRetry, getRetryCount } from "../../shared/rabbit";
import type { CanonicalOrder } from "../../shared/canonical-order";

const QUEUE = "notifications.queue";
const RESULTS_EXCHANGE = "results.notification";
const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3;
const PROCESSED_IDS_FILE = "/data/processed-ids.json";
const NOTIFICATION_LOG_FILE = "/data/notification.log";

// Load (or create) the persisted set of processed correlationIds
function loadProcessedIds(): Set<string> {
  try {
    const raw = fs.readFileSync(PROCESSED_IDS_FILE, "utf-8");
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

function saveProcessedIds(ids: Set<string>): void {
  fs.writeFileSync(PROCESSED_IDS_FILE, JSON.stringify([...ids]), "utf-8");
}

async function main(): Promise<void> {
  const { channel } = await connectWithRetry(process.env.RABBITMQ_URL!);
  await channel.prefetch(1);

  // Ensure data directory and files exist
  fs.mkdirSync("/data", { recursive: true });
  if (!fs.existsSync(PROCESSED_IDS_FILE)) {
    fs.writeFileSync(PROCESSED_IDS_FILE, "[]", "utf-8");
  }
  if (!fs.existsSync(NOTIFICATION_LOG_FILE)) {
    fs.writeFileSync(NOTIFICATION_LOG_FILE, "", "utf-8");
  }

  const processedIds = loadProcessedIds();

  console.log(`[Notification] Consuming from ${QUEUE}`);

  await channel.consume(QUEUE, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    const order = JSON.parse(msg.content.toString()) as CanonicalOrder;
    const correlationId = msg.properties.headers?.["correlationId"] as string | undefined;
    const retryCount = getRetryCount(msg);

    console.log(`[Notification] Processing ${correlationId} (attempt ${retryCount + 1})`);

    try {
      // Idempotent receiver: skip if already processed
      if (correlationId && processedIds.has(correlationId)) {
        channel.ack(msg);
        console.log(`[Notification] duplicate skipped ${correlationId}`);
        return;
      }

      // Append one JSON line to the notification log
      const logEntry = JSON.stringify({
        correlationId,
        orderId: order.orderId,
        customerEmail: order.customer.email,
        timestamp: new Date().toISOString(),
        message: "Order received",
      });
      fs.appendFileSync(NOTIFICATION_LOG_FILE, logEntry + "\n", "utf-8");

      // Persist correlationId so we never process this order twice
      if (correlationId) {
        processedIds.add(correlationId);
        saveProcessedIds(processedIds);
      }

      // Ack and publish result event
      channel.ack(msg);
      channel.publish(
        RESULTS_EXCHANGE,
        "",
        Buffer.from(JSON.stringify({
          correlationId,
          source: "notification",
          status: "success",
          timestamp: new Date().toISOString(),
          details: { message: `Notification sent for order ${order.orderId}` },
        })),
        {
          headers: { correlationId },
          contentType: "application/json",
        }
      );
      console.log(`[Notification] -> Success ${correlationId}`);
    } catch (err) {
      // Retry / DLQ logic (copied from payment-service reference).
      if (retryCount >= MAX_RETRIES - 1) {
        channel.publish(process.env.DLQ_EXCHANGE!, "", msg.content, {
          headers: msg.properties.headers,
        });
        channel.ack(msg);
        console.log(`[Notification] -> DLQ after ${retryCount + 1} attempts: ${(err as Error).message}`);
      } else {
        channel.nack(msg, false, false);
        console.log(`[Notification] -> Retry (attempt ${retryCount + 1}): ${(err as Error).message}`);
      }
    }
  });
}

main().catch(console.error);
