import { apiClient } from "./client";
import { resolveApiBaseUrl } from "../utils/network";

// ---- Department ----
export interface Department {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const departmentApi = {
  list: (activeOnly = false) =>
    apiClient.get("/api/departments", {
      params: { active: activeOnly || undefined },
    }),
  getById: (id: string) => apiClient.get(`/api/departments/${id}`),
  create: (data: Pick<Department, "name" | "code">) =>
    apiClient.post("/api/departments", data),
  update: (
    id: string,
    data: Partial<Pick<Department, "name" | "code" | "isActive">>,
  ) => apiClient.put(`/api/departments/${id}`, data),
  deactivate: (id: string) => apiClient.delete(`/api/departments/${id}`),
  exportUrl: () => `${resolveApiBaseUrl()}/departments/export`,
};

// ---- Semester ----
export interface Semester {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

export const semesterApi = {
  list: (activeOnly = false) =>
    apiClient.get("/api/semesters", {
      params: { active: activeOnly || undefined },
    }),
  getById: (id: string) => apiClient.get(`/api/semesters/${id}`),
  create: (data: Omit<Semester, "id" | "createdAt">) =>
    apiClient.post("/api/semesters", data),
  update: (id: string, data: Partial<Omit<Semester, "id" | "createdAt">>) =>
    apiClient.put(`/api/semesters/${id}`, data),
  exportUrl: () => `${resolveApiBaseUrl()}/semesters/export`,
};

// ---- Course ----
export interface Course {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  department?: { name: string; code: string };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const courseApi = {
  list: (params?: { departmentId?: string; active?: boolean }) =>
    apiClient.get("/api/courses", { params }),
  getById: (id: string) => apiClient.get(`/api/courses/${id}`),
  create: (data: Pick<Course, "code" | "name" | "departmentId">) =>
    apiClient.post("/api/courses", data),
  update: (
    id: string,
    data: Partial<Pick<Course, "code" | "name" | "departmentId" | "isActive">>,
  ) => apiClient.put(`/api/courses/${id}`, data),
  exportUrl: () => `${resolveApiBaseUrl()}/courses/export`,
};

// ---- Class ----
export interface ClassRecord {
  id: string;
  name: string;
  courseId: string;
  course?: { code: string; name: string };
  departmentId: string;
  department?: { name: string; code: string };
  semesterId: string;
  semester?: { name: string };
  roomNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const classApi = {
  list: (params?: {
    semesterId?: string;
    departmentId?: string;
    active?: boolean;
  }) => apiClient.get("/api/classes", { params }),
  getById: (id: string) => apiClient.get(`/api/classes/${id}`),
  create: (
    data: Pick<
      ClassRecord,
      "name" | "courseId" | "departmentId" | "semesterId" | "roomNumber"
    >,
  ) => apiClient.post("/api/classes", data),
  update: (
    id: string,
    data: Partial<
      Omit<
        ClassRecord,
        "id" | "course" | "department" | "semester" | "createdAt" | "updatedAt"
      >
    >,
  ) => apiClient.put(`/api/classes/${id}`, data),
  exportUrl: () => `${resolveApiBaseUrl()}/classes/export`,
};

// ---- Student ----
export interface Student {
  id: string;
  studentNumber: string | undefined;
  fullName: string | undefined;
  email: string | undefined;
  phone: string | null;
  departmentId: string | null;
  membershipTierId: string | null;
  membershipTier: { name: string } | null;
  growthPoints: number;
  storedValueBalance?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudentListResult {
  data: Student[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportRowError {
  row: number;
  studentNumber: string;
  errors: string[];
}

export interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: ImportRowError[];
}

export const studentApi = {
  list: (params?: {
    search?: string;
    departmentId?: string;
    active?: boolean;
    page?: number;
    limit?: number;
  }) => apiClient.get("/api/students", { params }),

  getById: (id: string) => apiClient.get(`/api/students/${id}`),

  create: (
    data: {
      studentNumber: string;
      fullName: string;
      email: string;
      phone?: string;
      departmentId?: string;
      membershipTierId?: string;
    },
    idempotencyKey: string,
  ) =>
    apiClient.post("/api/students", data, {
      headers: { "X-Idempotency-Key": idempotencyKey },
    }),

  update: (
    id: string,
    data: {
      fullName?: string;
      email?: string;
      phone?: string | null;
      departmentId?: string | null;
      membershipTierId?: string | null;
      isActive?: boolean;
    },
  ) => apiClient.put(`/api/students/${id}`, data),

  deactivate: (id: string) => apiClient.delete(`/api/students/${id}`),

  /** Returns 202 with { jobId } — poll /api/jobs/:jobId for progress */
  import: (file: File, idempotencyKey: string) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post("/api/students/import", form, {
      headers: {
        "Content-Type": "multipart/form-data",
        "X-Idempotency-Key": idempotencyKey,
      },
    });
  },

  exportCsv: () =>
    apiClient.get("/api/students/export", {
      responseType: "blob",
    }),

  exportUrl: () => `${resolveApiBaseUrl()}/students/export`,
};
