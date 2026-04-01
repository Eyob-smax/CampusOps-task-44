import type { UserRole } from "../types";

export const MASTER_DATA_READ_ROLES: UserRole[] = [
  "administrator",
  "operations_manager",
  "classroom_supervisor",
  "customer_service_agent",
  "auditor",
];

export const FULFILLMENT_READ_ROLES: UserRole[] = [
  "administrator",
  "operations_manager",
  "customer_service_agent",
  "auditor",
];

export const FULFILLMENT_CREATE_ROLES: UserRole[] = [
  "administrator",
  "operations_manager",
  "customer_service_agent",
];

export const SHIPMENT_READ_ROLES: UserRole[] = [
  "administrator",
  "operations_manager",
  "customer_service_agent",
  "auditor",
];

export const AFTER_SALES_READ_ROLES: UserRole[] = [
  "administrator",
  "operations_manager",
  "customer_service_agent",
  "auditor",
];

export const AFTER_SALES_CREATE_ROLES: UserRole[] = [
  "administrator",
  "customer_service_agent",
];
