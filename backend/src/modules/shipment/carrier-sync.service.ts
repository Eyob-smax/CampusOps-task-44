import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/encryption';
import { updateParcelStatus } from './parcel.service';
import { logger } from '../../lib/logger';
import { getCircuitBreaker } from '../../lib/circuit-breaker';
import { config } from '../../config';

// ---- Types ----

interface TrackingEvent {
  timestamp: string;
  description: string;
  location?: string;
}

interface ParcelUpdate {
  parcelId:       string;
  newStatus:      string;
  trackingEvents: TrackingEvent[];
}

const shipmentStatusSchema = z.enum([
  'pending',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
]);

const connectorEventSchema = z.object({
  timestamp: z.string().datetime().optional(),
  description: z.string().min(1),
  location: z.string().min(1).optional(),
});

const connectorParcelUpdateSchema = z
  .object({
    parcelId: z.string().uuid().optional(),
    trackingNumber: z.string().min(1).optional(),
    status: shipmentStatusSchema,
    events: z.array(connectorEventSchema).optional(),
  })
  .refine((entry) => !!entry.parcelId || !!entry.trackingNumber, {
    message: 'Connector update must include parcelId or trackingNumber',
  });

const connectorSyncResponseSchema = z.object({
  updates: z.array(connectorParcelUpdateSchema),
});

type SyncParcel = {
  id: string;
  shipmentId: string;
  trackingNumber: string;
  createdAt: Date;
  status: string;
};

// ---- Simulate carrier response (fallback mode) ----

/**
 * Generates deterministic fake status updates based on parcel age.
 * Rules:
 *   < 1h  → pending
 *   >= 1h  → in_transit
 *   >= 6h  → out_for_delivery
 *   >= 24h → delivered
 */
export function simulateCarrierResponse(
  parcels: Array<{ id: string; createdAt: Date; status: string }>,
  now: Date,
): ParcelUpdate[] {
  const updates: ParcelUpdate[] = [];

  for (const parcel of parcels) {
    const ageMs  = now.getTime() - parcel.createdAt.getTime();
    const ageHrs = ageMs / (1000 * 60 * 60);

    let newStatus: string;
    if (ageHrs >= 24) {
      newStatus = 'delivered';
    } else if (ageHrs >= 6) {
      newStatus = 'out_for_delivery';
    } else if (ageHrs >= 1) {
      newStatus = 'in_transit';
    } else {
      newStatus = 'pending';
    }

    // Only generate update if status would change
    if (newStatus === parcel.status) continue;

    const events: TrackingEvent[] = [];

    if (newStatus === 'in_transit') {
      events.push({
        timestamp:   new Date(parcel.createdAt.getTime() + 1 * 60 * 60 * 1000).toISOString(),
        description: 'Package picked up from warehouse',
        location:    'Origin Facility',
      });
    } else if (newStatus === 'out_for_delivery') {
      events.push(
        {
          timestamp:   new Date(parcel.createdAt.getTime() + 1 * 60 * 60 * 1000).toISOString(),
          description: 'Package picked up from warehouse',
          location:    'Origin Facility',
        },
        {
          timestamp:   new Date(parcel.createdAt.getTime() + 6 * 60 * 60 * 1000).toISOString(),
          description: 'Out for delivery',
          location:    'Local Delivery Hub',
        },
      );
    } else if (newStatus === 'delivered') {
      events.push(
        {
          timestamp:   new Date(parcel.createdAt.getTime() + 1 * 60 * 60 * 1000).toISOString(),
          description: 'Package picked up from warehouse',
          location:    'Origin Facility',
        },
        {
          timestamp:   new Date(parcel.createdAt.getTime() + 6 * 60 * 60 * 1000).toISOString(),
          description: 'Out for delivery',
          location:    'Local Delivery Hub',
        },
        {
          timestamp:   new Date(parcel.createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          description: 'Delivered to recipient',
          location:    'Destination',
        },
      );
    }

    updates.push({ parcelId: parcel.id, newStatus, trackingEvents: events });
  }

  return updates;
}

// ---- CarrierConnector class ----

export class CarrierConnector {
  async syncParcels(carrierId: string): Promise<{ updated: number; errors: number }> {
    // Wrap the actual sync logic in a circuit breaker per carrier
    const breaker = getCircuitBreaker<{ updated: number; errors: number }>(
      `carrier-sync:${carrierId}`,
      async () => this._doSync(carrierId),
    );
    return breaker.fire();
  }

  private async fetchConnectorUpdates(
    carrier: { id: string; connectorUrl: string; apiKeyEncrypted: string },
    parcels: SyncParcel[],
  ): Promise<ParcelUpdate[]> {
    const apiKey = decrypt(carrier.apiKeyEncrypted);
    const endpoint = `${carrier.connectorUrl.replace(/\/+$/, '')}/sync`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.shipmentSync.connectorTimeoutMs);

    let rawBody: unknown;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
        },
        body: JSON.stringify({
          carrierId: carrier.id,
          parcels: parcels.map((p) => ({
            parcelId: p.id,
            trackingNumber: p.trackingNumber,
            status: p.status,
            createdAt: p.createdAt.toISOString(),
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Connector responded ${response.status}: ${errorBody || response.statusText}`);
      }

      rawBody = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    const parsed = connectorSyncResponseSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new Error(`Connector response validation failed: ${parsed.error.issues[0]?.message ?? 'unknown format'}`);
    }

    const byId = new Map(parcels.map((p) => [p.id, p]));
    const byTracking = new Map(parcels.map((p) => [p.trackingNumber, p]));

    const updates: ParcelUpdate[] = [];
    for (const entry of parsed.data.updates) {
      const parcel =
        (entry.parcelId ? byId.get(entry.parcelId) : undefined) ??
        (entry.trackingNumber ? byTracking.get(entry.trackingNumber) : undefined);

      if (!parcel) {
        logger.warn({
          msg: 'Connector update skipped for unknown parcel',
          carrierId: carrier.id,
          parcelId: entry.parcelId,
          trackingNumber: entry.trackingNumber,
        });
        continue;
      }

      if (entry.status === parcel.status) {
        continue;
      }

      updates.push({
        parcelId: parcel.id,
        newStatus: entry.status,
        trackingEvents: (entry.events ?? []).map((event) => ({
          timestamp: event.timestamp ?? new Date().toISOString(),
          description: event.description,
          ...(event.location ? { location: event.location } : {}),
        })),
      });
    }

    return updates;
  }

  private async resolveCarrierUpdates(
    carrier: { id: string; connectorUrl: string; apiKeyEncrypted: string },
    parcels: SyncParcel[],
    now: Date,
  ): Promise<ParcelUpdate[]> {
    const mode = String(config.shipmentSync.mode).toLowerCase();
    const useConnectorMode = mode === 'connector';

    if (useConnectorMode) {
      try {
        return await this.fetchConnectorUpdates(carrier, parcels);
      } catch (err) {
        if (!config.shipmentSync.allowSimulationFallback) {
          throw err;
        }

        logger.warn({
          msg: 'Carrier connector sync failed; using simulation fallback',
          carrierId: carrier.id,
          err,
        });
      }
    }

    return simulateCarrierResponse(
      parcels.map((p) => ({ id: p.id, createdAt: p.createdAt, status: p.status })),
      now,
    );
  }

  private async _doSync(carrierId: string): Promise<{ updated: number; errors: number }> {
    // Fetch carrier with decrypted API key
    const carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) {
      const err: any = new Error('Carrier not found');
      err.status = 404;
      err.code   = 'CARRIER_NOT_FOUND';
      throw err;
    }

    // Fetch all parcels for this carrier's shipments
    const shipments = await prisma.shipment.findMany({
      where:   { carrierId, status: { notIn: ['delivered', 'returned'] } },
      include: { parcels: true },
    });

    const parcels = shipments.flatMap(s => s.parcels);
    if (parcels.length === 0) {
      logger.info({ msg: 'No parcels to sync', carrierId });
      return { updated: 0, errors: 0 };
    }

    const now = new Date();
    const updates = await this.resolveCarrierUpdates(carrier, parcels, now);

    let updated = 0;
    let errors  = 0;

    for (const update of updates) {
      try {
        // Update parcel status
        await updateParcelStatus(update.parcelId, update.newStatus, 'system');

        // Append timeline event to the parent shipment
        const parcel = parcels.find(p => p.id === update.parcelId);
        if (parcel) {
          logger.info({
            msg:            'Carrier sync parcel updated',
            parcelId:       update.parcelId,
            trackingNumber: parcel.trackingNumber,
            newStatus:      update.newStatus,
            events:         update.trackingEvents.length,
          });

          // Append timeline events to any open after-sales tickets on this shipment
          const openTickets = await prisma.afterSalesTicket.findMany({
            where: {
              OR: [
                { shipmentId: parcel.shipmentId },
                { parcelId:   parcel.id },
              ],
              status: { notIn: ['resolved', 'closed'] },
            },
            select: { id: true },
          });

          for (const t of openTickets) {
            await prisma.ticketTimelineEntry.create({
              data: {
                ticketId: t.id,
                actorId:  'system',
                action:   `carrier_sync:${update.newStatus}`,
                note:     `Carrier sync updated parcel ${parcel.trackingNumber} to ${update.newStatus}`,
              },
            });
          }
        }

        updated++;
      } catch (err) {
        logger.error({ msg: 'Failed to update parcel during sync', parcelId: update.parcelId, err });
        errors++;
      }
    }

    // Update carrier lastSyncAt via shipment update (touches updatedAt)
    await prisma.carrier.update({
      where: { id: carrierId },
      data:  { updatedAt: now },
    });

    // Update lastSyncAt on each synced shipment
    if (shipments.length > 0) {
      await prisma.shipment.updateMany({
        where: { carrierId, id: { in: shipments.map(s => s.id) } },
        data:  { lastSyncAt: now },
      });
    }

    logger.info({ msg: 'Carrier sync completed', carrierId, updated, errors });
    return { updated, errors };
  }
}

// ---- Run sync for all active carriers ----

export async function runSyncForAllActiveCarriers(): Promise<{ updated: number; errors: number }> {
  const carriers = await prisma.carrier.findMany({ where: { isActive: true } });

  let totalUpdated = 0;
  let totalErrors  = 0;

  const connector = new CarrierConnector();

  for (const carrier of carriers) {
    try {
      const result = await connector.syncParcels(carrier.id);
      totalUpdated += result.updated;
      totalErrors  += result.errors;
    } catch (err) {
      logger.error({ msg: 'Carrier sync failed', carrierId: carrier.id, err });
      totalErrors++;
    }
  }

  return { updated: totalUpdated, errors: totalErrors };
}
