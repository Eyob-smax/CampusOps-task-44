import { Router } from "express";
import {
  authenticate,
  requirePermission,
  denyAuditorWrites,
} from "../../middleware/auth.middleware";
import {
  getClasses,
  getClass,
  createClassHandler,
  updateClassHandler,
  exportClassesHandler,
} from "./class.controller";
import {
  uploadMasterDataImportFile,
  importClassesHandler,
} from "./master-import.controller";

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get("/", requirePermission("master-data:read"), getClasses);
router.get(
  "/export",
  requirePermission("master-data:read"),
  exportClassesHandler,
);
router.post(
  "/import",
  requirePermission("master-data:write"),
  uploadMasterDataImportFile,
  importClassesHandler,
);
router.get("/:id", requirePermission("master-data:read"), getClass);
router.post("/", requirePermission("master-data:write"), createClassHandler);
router.put("/:id", requirePermission("master-data:write"), updateClassHandler);

export default router;
