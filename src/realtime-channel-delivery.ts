import { deletePayload, recordsFromQuery, rejectBatch, runBatchQuery, settleBatch } from './realtime-autofetch.ts';
import type { RealtimeChannel } from './realtime-channel.ts';
import type { PendingRow } from './realtime-internal-types.ts';
import type { LightweightNotification } from './realtime-public-types.ts';
import { isLightweightNotification, payloadEvent, property } from './realtime-values.ts';

/**
 * Handle publication from server-side subscription
 * Called by VolcanoRealtime when a message arrives on the internal channel
 */
function handlePublication(channel: RealtimeChannel, ctx: unknown): void {
  if (channel._paused) {
    return;
  }
  const data = property(ctx, 'data');

  // Check if this is a lightweight notification (Phase 3)
  if (isLightweightNotification(data)) {
    void channel._handleLightweightNotification(data, ctx);
    return;
  }

  // Full payload - deliver immediately
  channel._deliverPayload(data, ctx);
}

/**
 * Handle a lightweight notification by auto-fetching the record data
 * @param {Object} data - Lightweight notification data
 * @param {Object} ctx - Publication context
 */
async function handleLightweightNotification(
  channel: RealtimeChannel,
  data: LightweightNotification,
  ctx: unknown,
): Promise<void> {
  // DELETE notifications may include old_record, deliver immediately
  if (data.type === 'DELETE') {
    channel._deliverPayload(deletePayload(data), ctx);
    return;
  }

  // If no volcanoClient or auto-fetch disabled, deliver lightweight as-is
  const volcanoClient = channel._realtime.getVolcanoClient();
  if (volcanoClient === null || !channel._fetchConfig.enabled) {
    channel._deliverPayload(data, ctx);
    return;
  }

  await channel._deliverFetchedNotification(data, ctx, channel._lifecycleVersion);
}

async function deliverFetchedNotification(
  channel: RealtimeChannel,
  data: LightweightNotification,
  ctx: unknown,
  lifecycleVersion: number,
): Promise<void> {
  // Auto-fetch the record for INSERT/UPDATE
  try {
    const record = await channel._fetchRow(data.schema, data.table, data.id);
    if (lifecycleVersion !== channel._lifecycleVersion) {
      return;
    }

    // Convert to full payload format for backward compatibility
    const fullPayload = {
      type: data.type,
      schema: data.schema,
      table: data.table,
      record,
      timestamp: data.timestamp,
    };

    channel._deliverPayload(fullPayload, ctx);
  } catch (err) {
    if (lifecycleVersion !== channel._lifecycleVersion) {
      return;
    }
    // On fetch error, still deliver the lightweight notification
    // so the client knows something changed, even if we couldn't get the data
    console.warn(
      `[Realtime] Failed to fetch record for ${data.schema}.${data.table}:${String(data.id)}:`,
      err instanceof Error ? err.message : String(err),
    );
    channel._deliverPayload(data, ctx);
  }
}

/**
 * Fetch a row from the database, batching requests for efficiency
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @param {*} id - Primary key value
 * @returns {Promise<Object>} The fetched record
 */
function fetchRow(channel: RealtimeChannel, schema: string, table: string, id: unknown): Promise<unknown> {
  const tableKey = `${schema}.${table}`;

  return new Promise<unknown>((resolve, reject) => {
    // Get or create pending batch for this table
    let batch = channel._pendingFetches.get(tableKey);
    if (batch === undefined) {
      batch = {
        ids: new Map<string, PendingRow>(),
        timer: null,
        schema,
        table,
      };
      channel._pendingFetches.set(tableKey, batch);
    }

    // Add this ID to the batch
    batch.ids.set(String(id), { resolve, reject });

    // Check if we should flush due to size
    if (batch.ids.size >= channel._fetchConfig.maxBatchSize) {
      void channel._flushFetch(schema, table);
      return;
    }

    // Set timer for batch window if not already set
    batch.timer ??= setTimeout(() => {
      void channel._flushFetch(schema, table);
    }, channel._fetchConfig.batchWindowMs);
  });
}

/**
 * Flush pending fetch requests for a table
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 */
async function flushFetch(channel: RealtimeChannel, schema: string, table: string): Promise<void> {
  const tableKey = `${schema}.${table}`;
  const batch = channel._pendingFetches.get(tableKey);

  if (batch === undefined || batch.ids.size === 0) {
    return;
  }

  // Clear timer and remove from pending
  if (batch.timer !== null) {
    clearTimeout(batch.timer);
  }
  channel._pendingFetches.delete(tableKey);

  try {
    const result: unknown = await runBatchQuery(channel._realtime, schema, table, [...batch.ids.keys()]);
    settleBatch(batch.ids, recordsFromQuery(result), table);
  } catch (err) {
    rejectBatch(batch.ids, err);
  }
}

/**
 * Deliver a payload to registered callbacks
 * @param {Object} data - Payload data
 * @param {Object} ctx - Publication context
 */
function deliverPayload(channel: RealtimeChannel, data: unknown, ctx: unknown): void {
  const event = payloadEvent(data);
  const callbacks = channel._callbacks.get(event) ?? [];
  callbacks.forEach((cb) => {
    cb(data, ctx);
  });

  // Also trigger wildcard listeners
  const wildcardCallbacks = channel._callbacks.get('*') ?? [];
  wildcardCallbacks.forEach((cb) => {
    cb(data, ctx);
  });
}

export {
  deliverFetchedNotification,
  deliverPayload,
  fetchRow,
  flushFetch,
  handleLightweightNotification,
  handlePublication,
};
