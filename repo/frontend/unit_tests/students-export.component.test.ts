/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  studentList: vi.fn(),
  studentExportCsv: vi.fn(),
  departmentList: vi.fn(),
  jobsApiMock: {
    getById: vi.fn(),
    downloadErrorReport: vi.fn(),
    retry: vi.fn(),
  },
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  messageInfo: vi.fn(),
}));

vi.mock("../src/api/master-data", () => ({
  studentApi: {
    list: mocks.studentList,
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    import: vi.fn(),
    exportCsv: mocks.studentExportCsv,
    exportUrl: vi.fn(),
  },
  departmentApi: {
    list: mocks.departmentList,
  },
}));

vi.mock("../src/api/jobs", () => ({
  jobsApi: mocks.jobsApiMock,
}));

vi.mock("../src/stores/auth", () => ({
  useAuthStore: () => ({
    can: (permission: string) => permission === "students:write",
    user: { role: "administrator" },
  }),
}));

vi.mock("element-plus", () => ({
  ElMessage: {
    error: mocks.messageError,
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
    info: mocks.messageInfo,
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
    mocks.studentList.mockReset();
    mocks.studentExportCsv.mockReset();
    mocks.departmentList.mockReset();
    mocks.messageError.mockReset();
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.messageInfo.mockReset();

    mocks.studentList.mockResolvedValue({ data: { data: [], total: 0 } });
    mocks.departmentList.mockResolvedValue({ data: { data: [] } });

    (globalThis.URL as any).createObjectURL = vi.fn(() => "blob:test-url");
    (globalThis.URL as any).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows explicit error feedback when CSV export fails", async () => {
    mocks.studentExportCsv.mockRejectedValue({ error: "Export unauthorized" });

    const wrapper = mountView();
    await flushPromises();

    const exportButton = wrapper
      .findAll("button")
      .find((btn: { text: () => string }) => btn.text().includes("Export CSV"));

    expect(exportButton).toBeDefined();
    await exportButton!.trigger("click");
    await flushPromises();

    expect(mocks.studentExportCsv).toHaveBeenCalled();
    expect(mocks.messageError).toHaveBeenCalledWith("Export unauthorized");
  });
});
