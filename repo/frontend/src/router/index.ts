import { createRouter, createWebHistory } from "vue-router";
import { installAuthGuards } from "./guards";
import {
  MASTER_DATA_READ_ROLES,
  FULFILLMENT_READ_ROLES,
  FULFILLMENT_CREATE_ROLES,
  SHIPMENT_READ_ROLES,
  AFTER_SALES_READ_ROLES,
  AFTER_SALES_CREATE_ROLES,
} from "./access-policy";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Public
    {
      path: "/login",
      component: () => import("../views/LoginView.vue"),
      meta: { title: "Login" },
    },

    // Authenticated shell
    {
      path: "/",
      component: () => import("../views/AppShell.vue"),
      meta: { requiresAuth: true },
      children: [
        { path: "", redirect: "/dashboard" },
        {
          path: "dashboard",
          component: () => import("../views/DashboardView.vue"),
          meta: { title: "Dashboard" },
        },

        // Classroom Operations
        {
          path: "classroom",
          component: () =>
            import("../views/classroom/ClassroomOperationsView.vue"),
          meta: {
            title: "Classroom Operations",
            roles: ["administrator", "classroom_supervisor"],
          },
        },
        {
          path: "classroom/anomalies",
          component: () => import("../views/classroom/AnomalyQueueView.vue"),
          meta: {
            title: "Anomaly Queue",
            roles: ["administrator", "classroom_supervisor"],
          },
        },

        // Parking Operations
        {
          path: "parking",
          component: () => import("../views/parking/ParkingOperationsView.vue"),
          meta: {
            title: "Parking Operations",
            roles: [
              "administrator",
              "operations_manager",
              "classroom_supervisor",
            ],
          },
        },
        {
          path: "parking/supervisor-queue",
          component: () => import("../views/parking/SupervisorQueueView.vue"),
          meta: {
            title: "Supervisor Queue",
            roles: ["administrator", "classroom_supervisor"],
          },
        },

        // Master Data
        {
          path: "students",
          component: () => import("../views/master-data/StudentsView.vue"),
          meta: { title: "Students", roles: MASTER_DATA_READ_ROLES },
        },
        {
          path: "departments",
          component: () => import("../views/master-data/DepartmentsView.vue"),
          meta: { title: "Departments", roles: MASTER_DATA_READ_ROLES },
        },
        {
          path: "courses",
          component: () => import("../views/master-data/CoursesView.vue"),
          meta: { title: "Courses", roles: MASTER_DATA_READ_ROLES },
        },
        {
          path: "classes",
          component: () => import("../views/master-data/ClassesView.vue"),
          meta: { title: "Classes", roles: MASTER_DATA_READ_ROLES },
        },
        {
          path: "semesters",
          component: () => import("../views/master-data/SemestersView.vue"),
          meta: { title: "Semesters", roles: MASTER_DATA_READ_ROLES },
        },

        // Warehouse & Logistics
        {
          path: "warehouses",
          component: () => import("../views/logistics/WarehousesView.vue"),
          meta: {
            title: "Warehouses",
            roles: ["administrator", "operations_manager"],
          },
        },
        {
          path: "carriers",
          component: () => import("../views/logistics/CarriersView.vue"),
          meta: {
            title: "Carriers",
            roles: ["administrator", "operations_manager"],
          },
        },
        {
          path: "delivery-zones",
          component: () => import("../views/logistics/DeliveryZonesView.vue"),
          meta: {
            title: "Delivery Zones",
            roles: ["administrator", "operations_manager"],
          },
        },
        {
          path: "shipping-templates",
          component: () =>
            import("../views/logistics/ShippingTemplatesView.vue"),
          meta: {
            title: "Shipping Fee Templates",
            roles: ["administrator", "operations_manager"],
          },
        },

        // Membership
        {
          path: "membership/tiers",
          component: () => import("../views/membership/TiersView.vue"),
          meta: {
            title: "Membership Tiers",
            roles: ["administrator", "operations_manager"],
          },
        },
        {
          path: "membership/coupons",
          component: () => import("../views/membership/CouponsView.vue"),
          meta: {
            title: "Coupons",
            roles: ["administrator", "operations_manager"],
          },
        },
        {
          path: "membership/stored-value",
          name: "StoredValue",
          component: () => import("../views/membership/StoredValueView.vue"),
          meta: {
            title: "Stored Value",
            requiresAuth: true,
            roles: ["administrator", "operations_manager"],
          },
        },

        // Fulfillment
        {
          path: "fulfillment",
          component: () =>
            import("../views/fulfillment/FulfillmentListView.vue"),
          meta: {
            title: "Fulfillment Requests",
            roles: FULFILLMENT_READ_ROLES,
          },
        },
        {
          path: "fulfillment/new",
          component: () =>
            import("../views/fulfillment/FulfillmentCreateView.vue"),
          meta: {
            title: "New Fulfillment Request",
            roles: FULFILLMENT_CREATE_ROLES,
          },
        },
        {
          path: "fulfillment/:id",
          component: () =>
            import("../views/fulfillment/FulfillmentDetailView.vue"),
          meta: { title: "Fulfillment Detail", roles: FULFILLMENT_READ_ROLES },
        },

        // Shipments
        {
          path: "shipments",
          component: () => import("../views/shipment/ShipmentsView.vue"),
          meta: { title: "Shipments", roles: SHIPMENT_READ_ROLES },
        },
        {
          path: "shipments/:id",
          component: () => import("../views/shipment/ShipmentDetailView.vue"),
          meta: { title: "Shipment Detail", roles: SHIPMENT_READ_ROLES },
        },

        // After-Sales
        {
          path: "after-sales",
          component: () => import("../views/after-sales/TicketsListView.vue"),
          meta: { title: "After-Sales Tickets", roles: AFTER_SALES_READ_ROLES },
        },
        {
          path: "after-sales/new",
          component: () => import("../views/after-sales/TicketCreateView.vue"),
          meta: { title: "New Ticket", roles: AFTER_SALES_CREATE_ROLES },
        },
        {
          path: "after-sales/:id",
          component: () => import("../views/after-sales/TicketDetailView.vue"),
          meta: { title: "Ticket Detail", roles: AFTER_SALES_READ_ROLES },
        },

        // Admin
        {
          path: "admin/users",
          component: () => import("../views/admin/UsersView.vue"),
          meta: { title: "User Management", roles: ["administrator"] },
        },
        {
          path: "admin/audit-log",
          component: () => import("../views/admin/AuditLogView.vue"),
          meta: { title: "Audit Log", roles: ["administrator", "auditor"] },
        },
        {
          path: "admin/jobs",
          component: () => import("../views/admin/JobMonitorView.vue"),
          meta: {
            title: "Job Monitor",
            roles: ["administrator", "operations_manager"],
          },
        },
        {
          path: "admin/settings",
          component: () => import("../views/admin/SystemSettingsView.vue"),
          meta: { title: "System Settings", roles: ["administrator"] },
        },

        // Observability
        {
          path: "admin/metrics",
          component: () => import("../views/observability/MetricsView.vue"),
          meta: { title: "Metrics & Alerts", roles: ["administrator"] },
        },
        {
          path: "admin/logs",
          component: () => import("../views/observability/LogSearchView.vue"),
          meta: { title: "Log Search", roles: ["administrator"] },
        },
      ],
    },

    // 404
    {
      path: "/:pathMatch(.*)*",
      component: () => import("../views/NotFoundView.vue"),
    },
  ],
});

installAuthGuards(router);

export default router;
