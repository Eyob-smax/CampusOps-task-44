import { prisma } from '../../lib/prisma';
import { decrypt } from '../../lib/encryption';
import { updateParcelStatus } from './parcel.service';
import { logger } from '../../lib/logger';
import { getCircuitBreaker } from '../../lib/circuit-breaker';

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

// ---- Simulate carrier response (pure function, no network calls) ----

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

  private async _doSync(carrierId: string): Promise<{ updated: number; errors: number }> {
    // Fetch carrier with decrypted API key
    const carrier = await prisma.carrier.findUnique({ where: { id: carrierId } });
    if (!carrier) {
      const err: any = new Error('Carrier not found');
      err.status = 404;
      err.code   = 'CARRIER_NOT_FOUND';
      throw err;
    }

    // Decrypt API key (simulated — we do not make actual HTTP requests)
    let _apiKey: string;
    try {
      _apiKey = decrypt(carrier.apiKeyEncrypted);
    } catch (e) {
      logger.warn({ msg: 'Failed to decrypt carrier API key', carrierId });
      _apiKey = '';
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

    const now     = new Date();
    const updates = simulateCarrierResponse(
      parcels.map(p => ({ id: p.id, createdAt: p.createdAt, status: p.status })),
      now,
    );

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
