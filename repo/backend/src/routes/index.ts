import { Application } from 'express';
import healthRoutes       from '../modules/health/health.routes';
import authRoutes         from '../modules/auth/auth.routes';
import auditRoutes        from '../modules/admin/audit.routes';
import userRoutes         from '../modules/admin/user.routes';
import settingsRoutes     from '../modules/admin/settings.routes';
import departmentRoutes   from '../modules/master-data/department.routes';
import semesterRoutes     from '../modules/master-data/semester.routes';
import courseRoutes       from '../modules/master-data/course.routes';
import classRoutes        from '../modules/master-data/class.routes';
import studentRoutes      from '../modules/master-data/student.routes';
import jobRoutes          from '../modules/jobs/job.routes';
import classroomRoutes    from '../modules/classroom/classroom.routes';
import anomalyRoutes      from '../modules/classroom/anomaly.routes';
import parkingRoutes      from '../modules/parking/parking.routes';
import parkingAlertRoutes from '../modules/parking/alert.routes';
import warehouseRoutes    from '../modules/warehouse/warehouse.routes';
import carrierRoutes      from '../modules/carrier/carrier.routes';
import deliveryZoneRoutes from '../modules/delivery-zone/delivery-zone.routes';
import shippingRoutes     from '../modules/shipping/shipping.routes';
import membershipRoutes   from '../modules/membership/membership.routes';
import couponRoutes       from '../modules/membership/coupon.routes';
import fulfillmentRoutes  from '../modules/fulfillment/fulfillment.routes';
import storedValueRoutes  from '../modules/stored-value/stored-value.routes';
import shipmentRoutes     from '../modules/shipment/shipment.routes';
import parcelRoutes       from '../modules/shipment/parcel.routes';
import afterSalesRoutes   from '../modules/after-sales/after-sales.routes';
import metricsRoutes      from '../modules/observability/metrics.routes';
import logRoutes          from '../modules/observability/log.routes';
import thresholdRoutes    from '../modules/observability/threshold.routes';
import backupRoutes       from '../modules/observability/backup.routes';

export function registerRoutes(app: Application): void {
  // ---- Infrastructure (no auth) ----
  app.use('/health', healthRoutes);

  // ---- Authentication ----
  app.use('/api/auth', authRoutes);

  // ---- Admin ----
  app.use('/api/admin/audit',    auditRoutes);
  app.use('/api/admin/users',    userRoutes);
  app.use('/api/admin/settings', settingsRoutes);

  // ---- Jobs ----
  app.use('/api/jobs', jobRoutes);

  // ---- Master data ----
  app.use('/api/departments', departmentRoutes);
  app.use('/api/semesters',   semesterRoutes);
  app.use('/api/courses',     courseRoutes);
  app.use('/api/classes',     classRoutes);
  app.use('/api/students',    studentRoutes);

  // ---- Classroom & Anomaly (Prompt 5) ----
  app.use('/api/classrooms', classroomRoutes);
  app.use('/api/anomalies',  anomalyRoutes);

  // ---- Parking (Prompt 6) ----
  app.use('/api/parking',        parkingRoutes);
  app.use('/api/parking-alerts', parkingAlertRoutes);

  // ---- Logistics (Prompt 7) ----
  app.use('/api/warehouses',         warehouseRoutes);
  app.use('/api/carriers',           carrierRoutes);
  app.use('/api/delivery-zones',     deliveryZoneRoutes);
  app.use('/api/shipping-templates', shippingRoutes);

  // ---- Membership & Coupons (Prompt 7) ----
  app.use('/api/membership/tiers', membershipRoutes);
  app.use('/api/coupons',          couponRoutes);

  // ---- Fulfillment & Stored Value (Prompt 7) ----
  app.use('/api/fulfillment',  fulfillmentRoutes);
  app.use('/api/stored-value', storedValueRoutes);

  // ---- Shipments & Parcels (Prompt 8) ----
  app.use('/api/shipments', shipmentRoutes);
  app.use('/api/parcels',   parcelRoutes);

  // ---- After-Sales (Prompt 8) ----
  app.use('/api/after-sales', afterSalesRoutes);

  // ---- Observability (Prompt 9) ----
  app.use('/api', metricsRoutes);    // /api/metrics, /api/alerts
  app.use('/api', logRoutes);        // /api/logs
  app.use('/api', thresholdRoutes);  // /api/thresholds
  app.use('/api', backupRoutes);     // /api/backups

  // 404 catch-all for all /api/* routes
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found', code: 'NOT_FOUND' });
  });
}
