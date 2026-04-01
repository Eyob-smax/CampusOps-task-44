import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import type { UserRole } from '../types';

const MASTER_DATA_READ_ROLES: UserRole[] = [
  'administrator',
  'operations_manager',
  'classroom_supervisor',
  'customer_service_agent',
  'auditor',
];

// Route meta typing
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    roles?: UserRole[];
    title?: string;
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public
    { path: '/login', component: () => import('../views/LoginView.vue'), meta: { title: 'Login' } },

    // Authenticated shell
    {
      path: '/',
      component: () => import('../views/AppShell.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: 'Dashboard' } },

        // Classroom Operations
        {
          path: 'classroom',
          component: () => import('../views/classroom/ClassroomOperationsView.vue'),
          meta: { title: 'Classroom Operations', roles: ['administrator', 'classroom_supervisor'] },
        },
        {
          path: 'classroom/anomalies',
          component: () => import('../views/classroom/AnomalyQueueView.vue'),
          meta: { title: 'Anomaly Queue', roles: ['administrator', 'classroom_supervisor'] },
        },

        // Parking Operations
        {
          path: 'parking',
          component: () => import('../views/parking/ParkingOperationsView.vue'),
          meta: { title: 'Parking Operations', roles: ['administrator', 'operations_manager', 'classroom_supervisor'] },
        },
        {
          path: 'parking/supervisor-queue',
          component: () => import('../views/parking/SupervisorQueueView.vue'),
          meta: { title: 'Supervisor Queue', roles: ['administrator', 'classroom_supervisor'] },
        },

        // Master Data
        { path: 'students', component: () => import('../views/master-data/StudentsView.vue'), meta: { title: 'Students', roles: MASTER_DATA_READ_ROLES } },
        { path: 'departments', component: () => import('../views/master-data/DepartmentsView.vue'), meta: { title: 'Departments', roles: MASTER_DATA_READ_ROLES } },
        { path: 'courses', component: () => import('../views/master-data/CoursesView.vue'), meta: { title: 'Courses', roles: MASTER_DATA_READ_ROLES } },
        { path: 'classes', component: () => import('../views/master-data/ClassesView.vue'), meta: { title: 'Classes', roles: MASTER_DATA_READ_ROLES } },
        { path: 'semesters', component: () => import('../views/master-data/SemestersView.vue'), meta: { title: 'Semesters', roles: MASTER_DATA_READ_ROLES } },

        // Warehouse & Logistics
        { path: 'warehouses', component: () => import('../views/logistics/WarehousesView.vue'), meta: { title: 'Warehouses', roles: ['administrator', 'operations_manager'] } },
        { path: 'carriers', component: () => import('../views/logistics/CarriersView.vue'), meta: { title: 'Carriers', roles: ['administrator', 'operations_manager'] } },
        { path: 'delivery-zones', component: () => import('../views/logistics/DeliveryZonesView.vue'), meta: { title: 'Delivery Zones', roles: ['administrator', 'operations_manager'] } },
        { path: 'shipping-templates', component: () => import('../views/logistics/ShippingTemplatesView.vue'), meta: { title: 'Shipping Fee Templates', roles: ['administrator', 'operations_manager'] } },

        // Membership
        { path: 'membership/tiers', component: () => import('../views/membership/TiersView.vue'), meta: { title: 'Membership Tiers', roles: ['administrator', 'operations_manager'] } },
        { path: 'membership/coupons', component: () => import('../views/membership/CouponsView.vue'), meta: { title: 'Coupons', roles: ['administrator', 'operations_manager'] } },
        {
          path: 'membership/stored-value',
          name: 'StoredValue',
          component: () => import('../views/membership/StoredValueView.vue'),
          meta: { title: 'Stored Value', requiresAuth: true, roles: ['administrator', 'operations_manager', 'customer_service_agent'] },
        },

        // Fulfillment
        { path: 'fulfillment', component: () => import('../views/fulfillment/FulfillmentListView.vue'), meta: { title: 'Fulfillment Requests' } },
        { path: 'fulfillment/new', component: () => import('../views/fulfillment/FulfillmentCreateView.vue'), meta: { title: 'New Fulfillment Request' } },
        { path: 'fulfillment/:id', component: () => import('../views/fulfillment/FulfillmentDetailView.vue'), meta: { title: 'Fulfillment Detail' } },

        // Shipments
        { path: 'shipments', component: () => import('../views/shipment/ShipmentsView.vue'), meta: { title: 'Shipments' } },
        { path: 'shipments/:id', component: () => import('../views/shipment/ShipmentDetailView.vue'), meta: { title: 'Shipment Detail' } },

        // After-Sales
        { path: 'after-sales', component: () => import('../views/after-sales/TicketsListView.vue'), meta: { title: 'After-Sales Tickets' } },
        { path: 'after-sales/new', component: () => import('../views/after-sales/TicketCreateView.vue'), meta: { title: 'New Ticket' } },
        { path: 'after-sales/:id', component: () => import('../views/after-sales/TicketDetailView.vue'), meta: { title: 'Ticket Detail' } },

        // Admin
        { path: 'admin/users', component: () => import('../views/admin/UsersView.vue'), meta: { title: 'User Management', roles: ['administrator'] } },
        { path: 'admin/audit-log', component: () => import('../views/admin/AuditLogView.vue'), meta: { title: 'Audit Log', roles: ['administrator', 'auditor'] } },
        { path: 'admin/jobs', component: () => import('../views/admin/JobMonitorView.vue'), meta: { title: 'Job Monitor', roles: ['administrator', 'operations_manager'] } },
        { path: 'admin/settings', component: () => import('../views/admin/SystemSettingsView.vue'), meta: { title: 'System Settings', roles: ['administrator'] } },

        // Observability
        { path: 'admin/metrics', component: () => import('../views/observability/MetricsView.vue'), meta: { title: 'Metrics & Alerts', roles: ['administrator'] } },
        { path: 'admin/logs', component: () => import('../views/observability/LogSearchView.vue'), meta: { title: 'Log Search', roles: ['administrator'] } },
      ],
    },

    // 404
    { path: '/:pathMatch(.*)*', component: () => import('../views/NotFoundView.vue') },
  ],
});

// Route guards
router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth) {
    await auth.ensureInitialized();
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  if (to.meta.roles) {
    if (!auth.user || !to.meta.roles.includes(auth.user.role)) {
      return { path: '/dashboard' };
    }
  }

  document.title = to.meta.title ? `${to.meta.title} — CampusOps` : 'CampusOps';
  return true;
});

export default router;
