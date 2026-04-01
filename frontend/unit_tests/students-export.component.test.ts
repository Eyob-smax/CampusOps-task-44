/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";

const studentList = vi.fn();
const studentExportCsv = vi.fn();
const departmentList = vi.fn();

const jobsApiMock = {
  getById: vi.fn(),
  downloadErrorReport: vi.fn(),
  retry: vi.fn(),
};

const messageError = vi.fn();
const messageSuccess = vi.fn();
const messageWarning = vi.fn();
const messageInfo = vi.fn();

vi.mock("../src/api/master-data", () => ({
  studentApi: {
    list: studentList,
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    import: vi.fn(),
    exportCsv: studentExportCsv,
    exportUrl: vi.fn(),
  },
  departmentApi: {
    list: departmentList,
  },
}));

vi.mock("../src/api/jobs", () => ({
  jobsApi: jobsApiMock,
}));

vi.mock("../src/stores/auth", () => ({
  useAuthStore: () => ({
    can: (permission: string) => permission === "students:write",
    user: { role: "administrator" },
  }),
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    error: messageError,
    success: messageSuccess,
    warning: messageWarning,
    info: messageInfo,
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue(undefined),
  },
}));

import StudentsView from "../src/views/master-data/StudentsView.vue";

function mountView() {
  return shallowMount(StudentsView, {
    global: {
      stubs: {
        "el-button": {
          template: "<button @click=\"$emit('click')\"><slot /></button>",
        },
        "el-card": { template: "<div><slot /></div>" },
        "el-input": true,
        "el-select": true,
        "el-option": true,
        "el-table": true,
        "el-table-column": true,
        "el-pagination": true,
        "el-dialog": true,
        "el-form": true,
        "el-form-item": true,
        "el-switch": true,
        "el-alert": true,
        "el-collapse": true,
        "el-collapse-item": true,
        "el-upload": true,
        "el-icon": true,
        upload: true,
        download: true,
        plus: true,
      },
    },
  });
}

describe("Students export workflow", () => {
  beforeEach(() => {
    studentList.mockReset();
    studentExportCsv.mockReset();
    departmentList.mockReset();
    messageError.mockReset();
    messageSuccess.mockReset();
    messageWarning.mockReset();
    messageInfo.mockReset();

    studentList.mockResolvedValue({ data: { data: [], total: 0 } });
    departmentList.mockResolvedValue({ data: { data: [] } });

    (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:test-url");
    (globalThis.URL as any).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows explicit error feedback when CSV export fails", async () => {
    studentExportCsv.mockRejectedValue({ error: "Export unauthorized" });

    const wrapper = mountView();
    await flushPromises();

    const exportButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("Export CSV"));

    expect(exportButton).toBeDefined();
    await exportButton!.trigger("click");
    await flushPromises();

    expect(studentExportCsv).toHaveBeenCalledTimes(1);
    expect(messageError).toHaveBeenCalledWith("Export unauthorized");
  });
});
