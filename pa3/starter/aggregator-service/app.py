"""
Aggregator Service
==================
Your job: implement the AGGREGATOR pattern on top of the connection
handling and consume loop already wired up below.

- Collect item results from orders.results, grouped by orderId.
- Completion condition: every item of the order has reported a result.
- Timeout: if the order has been sitting incomplete for too long (one
  worker crashed, or was never running), emit a PARTIAL result instead of
  waiting forever. A hung order is a worse outcome than an honest partial
  answer.
- Duplicate results (the same item redelivered, e.g. after a requeue) must
  not be double-counted.
- Two orders in flight at once must never have their results mixed up.

Consumes from: orders.results
Publishes to:  orders.complete

Required shape of the message you publish to orders.complete (tests depend
on every one of these fields):

    {
        "orderId": "<the order this result set belongs to>",
        "correlationId": "<same value as orderId>",
        "status": "complete" | "partial",
        "totalItems": <the totalItems every item message carried>,
        "receivedItems": <how many distinct items you actually collected>,
        "itemResults": [ <the result messages you received, in any order> ],
        "missingItemIndexes": [ <itemIndex values you never received>
                                 -- empty list when status == "complete" ]
    }

Publish exactly ONE message to orders.complete per order, whichever status
it ends up with.
"""

import json
import pika
import os
import threading
import time


# in_flight tracks every order currently being aggregated.
# Structure per orderId:
#   {
#       'total_items': int,            # totalItems carried on each item message
#       'results': {itemIndex: msg},   # dict keyed by itemIndex → dedup for free
#       'correlation_id': str,
#       'last_seen': float,            # monotonic timestamp; reset on each arrival
#   }
in_flight = {}
lock = threading.Lock()

# An idle timeout: if no new result arrives for a given order within this many
# seconds, the order is considered timed-out and a partial result is emitted.
# We use an *idle* timeout rather than a fixed deadline so that a legitimately
# large order (50 items, each taking 1–2 s) has its timer reset as long as
# workers keep delivering — it only times out when a worker goes silent.
# The value is read from the environment so it can be tuned per deployment
# (docker-compose.yml sets it to 5 s, which gives workers a realistic window).
IDLE_TIMEOUT_SECONDS = float(os.environ.get('AGGREGATOR_IDLE_TIMEOUT_SECONDS', '5'))

# How often the background sweep checks for timed-out orders. Independent
# of IDLE_TIMEOUT_SECONDS; this just controls how promptly a timeout is
# noticed once it has actually elapsed.
SWEEP_INTERVAL_SECONDS = 1.0


def get_rabbitmq_connection():
    """Create a connection to RabbitMQ using environment variable for host."""
    return pika.BlockingConnection(
        pika.ConnectionParameters(host=os.environ.get('RABBITMQ_HOST', 'localhost'))
    )


def publish_completion(message):
    """Publish a single message to orders.complete. Called with the lock
    already released -- do not hold `lock` while doing network I/O."""
    connection = get_rabbitmq_connection()
    channel = connection.channel()
    channel.queue_declare(queue='orders.complete', durable=True)
    channel.basic_publish(
        exchange='',
        routing_key='orders.complete',
        body=json.dumps(message),
        properties=pika.BasicProperties(delivery_mode=2)  # Persistent
    )
    connection.close()


def build_completion_message(order_id, state, status):
    """Build the orders.complete payload from aggregated state."""
    results = state['results']
    total = state['total_items']
    received_indexes = set(results.keys())
    all_indexes = set(range(total))
    missing = sorted(all_indexes - received_indexes)
    return {
        'orderId': order_id,
        'correlationId': state['correlation_id'],
        'status': status,
        'totalItems': total,
        'receivedItems': len(results),
        'itemResults': list(results.values()),
        'missingItemIndexes': missing,
    }


def aggregate_result(ch, method, properties, body):
    """
    Handle one message from orders.results:
    1. Parse it (fields: orderId, correlationId, itemIndex, totalItems,
       plus whatever the worker added -- status, trackingNumber /
       downloadUrl / confirmationCode, itemName, ...).
    2. Record it against the right order, keyed by itemIndex so a
       redelivered duplicate is a no-op rather than a second entry.
    3. Update that order's last-activity timestamp (for the sweep).
    4. If every expected item has now been recorded, build the
       "complete" message and call publish_completion(), then drop the
       order from in-flight state.  State changes under the lock; publish
       after releasing it.
    5. Ack the message regardless (a bad/unparseable message should not
       jam the queue).
    """
    try:
        result = json.loads(body)
        order_id = result['orderId']
        item_index = result['itemIndex']
        total_items = result['totalItems']
        correlation_id = result['correlationId']
    except (json.JSONDecodeError, KeyError) as exc:
        print(f"[Aggregator] ERROR: unparseable result message ({exc}), acking and skipping")
        ch.basic_ack(delivery_tag=method.delivery_tag)
        return

    to_publish = None  # completion message to emit after releasing the lock

    with lock:
        # Initialise state for this order if it's the first result we've seen.
        if order_id not in in_flight:
            in_flight[order_id] = {
                'total_items': total_items,
                'results': {},
                'correlation_id': correlation_id,
                'last_seen': time.monotonic(),
            }

        state = in_flight[order_id]

        # Deduplicate: if we already have a result for this itemIndex, ignore
        # the redelivery silently (the dict assignment would overwrite it, but
        # we skip even that to keep the behaviour a pure no-op).
        if item_index not in state['results']:
            state['results'][item_index] = result
            state['last_seen'] = time.monotonic()
            print(
                f"[Aggregator] Order {order_id}: received item {item_index} "
                f"({len(state['results'])}/{total_items})"
            )
        else:
            print(
                f"[Aggregator] Order {order_id}: duplicate item {item_index} — ignored"
            )

        # Check if all items have arrived.
        if len(state['results']) == total_items:
            to_publish = build_completion_message(order_id, state, 'complete')
            del in_flight[order_id]
            print(f"[Aggregator] Order {order_id}: complete — publishing to orders.complete")

    # Publish outside the lock to avoid holding it during network I/O.
    if to_publish is not None:
        publish_completion(to_publish)

    ch.basic_ack(delivery_tag=method.delivery_tag)


def sweep_timeouts():
    """
    Runs forever in a background thread, started from main(). Every
    SWEEP_INTERVAL_SECONDS, look for orders that have gone quiet:

    For every in-flight order whose last-activity timestamp is more than
    IDLE_TIMEOUT_SECONDS in the past, build a "partial" message
    (status="partial", missingItemIndexes non-empty) and call
    publish_completion(), then drop the order from in-flight state.
    Same lock discipline as aggregate_result: mutate state under the lock,
    publish after releasing it.
    """
    while True:
        time.sleep(SWEEP_INTERVAL_SECONDS)

        now = time.monotonic()
        timed_out = []

        with lock:
            for order_id, state in list(in_flight.items()):
                idle_for = now - state['last_seen']
                if idle_for >= IDLE_TIMEOUT_SECONDS:
                    timed_out.append((order_id, build_completion_message(order_id, state, 'partial')))
                    del in_flight[order_id]
                    print(
                        f"[Aggregator] Order {order_id}: timed out after "
                        f"{idle_for:.1f}s idle — publishing partial result"
                    )

        # Publish outside the lock.
        for order_id, msg in timed_out:
            publish_completion(msg)


def main():
    """Main entry point: connect to RabbitMQ, start the timeout sweeper,
    and start consuming results."""
    connection = get_rabbitmq_connection()
    channel = connection.channel()

    # Declare queues (idempotent)
    channel.queue_declare(queue='orders.results', durable=True)
    channel.queue_declare(queue='orders.complete', durable=True)

    # Fair dispatch
    channel.basic_qos(prefetch_count=1)

    # Background thread: sweeps for orders that timed out waiting on a
    # worker that never answered.
    sweeper = threading.Thread(target=sweep_timeouts, daemon=True)
    sweeper.start()

    # Start consuming
    channel.basic_consume(queue='orders.results', on_message_callback=aggregate_result)

    print('[Aggregator] Waiting for results...')
    channel.start_consuming()


if __name__ == '__main__':
    main()
