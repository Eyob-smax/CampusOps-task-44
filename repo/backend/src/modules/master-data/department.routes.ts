import { Router } from "express";
import {
  authenticate,
  requirePermission,
  denyAuditorWrites,
} from "../../middleware/auth.middleware";
import {
  getDepartments,
  getDepartment,
  createDepartmentHandler,
  updateDepartmentHandler,
  deactivateDepartmentHandler,
  exportDepartmentsHandler,
} from "./department.controller";
import {
  uploadMasterDataImportFile,
  importDepartmentsHandler,
} from "./master-import.controller";
import { idempotency } from "../../middleware/idempotency.middleware";

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get("/", requirePermission("master-data:read"), getDepartments);
router.get(
  "/export",
  requirePermission("master-data:read"),
  exportDepartmentsHandler,
);
router.post(
  "/import",
  requirePermission("master-data:write"),
  idempotency,
  uploadMasterDataImportFile,
  importDepartmentsHandler,
);
router.get("/:id", requirePermission("master-data:read"), getDepartment);
router.post(
  "/",
  requirePermission("master-data:write"),
  idempotency,
  createDepartmentHandler,
);
router.put(
  "/:id",
  requirePermission("master-data:write"),
  idempotency,
  updateDepartmentHandler,
);
router.delete(
  "/:id",
  requirePermission("master-data:write"),
  deactivateDepartmentHandler,
);

export default router;
