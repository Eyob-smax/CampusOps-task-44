import { Router } from "express";
import {
  authenticate,
  requirePermission,
  denyAuditorWrites,
} from "../../middleware/auth.middleware";
import { idempotency } from "../../middleware/idempotency.middleware";
import {
  getCourses,
  getCourse,
  createCourseHandler,
  updateCourseHandler,
  exportCoursesHandler,
} from "./course.controller";
import {
  uploadMasterDataImportFile,
  importCoursesHandler,
} from "./master-import.controller";

const router = Router();

router.use(authenticate);
router.use(denyAuditorWrites());

router.get("/", requirePermission("master-data:read"), getCourses);
router.get(
  "/export",
  requirePermission("master-data:read"),
  exportCoursesHandler,
);
router.post(
  "/import",
  requirePermission("master-data:write"),
  idempotency,
  uploadMasterDataImportFile,
  importCoursesHandler,
);
router.get("/:id", requirePermission("master-data:read"), getCourse);
router.post(
  "/",
  requirePermission("master-data:write"),
  idempotency,
  createCourseHandler,
);
router.put(
  "/:id",
  requirePermission("master-data:write"),
  idempotency,
  updateCourseHandler,
);

export default router;