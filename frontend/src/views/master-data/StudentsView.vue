<template>
  <div class="page-students">
    <div class="page-header">
      <span class="page-title">Students</span>
      <div class="header-actions">
        <el-button v-if="canWrite" :icon="Upload" @click="importVisible = true">Import</el-button>
        <el-button :icon="Download" @click="doExport">Export CSV</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreateDialog">Add Student</el-button>
      </div>
    </div>

    <!-- Search toolbar -->
    <el-card shadow="never" style="margin-bottom:12px">
      <div class="toolbar">
        <el-input v-model="search" placeholder="Search name / ID / email" clearable style="width:280px" @input="debouncedLoad" />
        <el-select v-model="filterDept" placeholder="All Departments" clearable style="width:200px" @change="load">
          <el-option v-for="d in departments" :key="d.id" :label="`${d.code} — ${d.name}`" :value="d.id" />
        </el-select>
        <el-select v-model="filterActive" style="width:130px" @change="load">
          <el-option label="Active only" :value="true" />
          <el-option label="All"         :value="undefined" />
          <el-option label="Inactive"    :value="false" />
        </el-select>
      </div>
    </el-card>

    <!-- Table -->
    <el-card shadow="never" v-loading="loading">
      <el-table :data="students" stripe border style="width:100%">
        <el-table-column prop="studentNumber" label="Student #"   width="130" />
        <el-table-column prop="fullName"      label="Full Name"   min-width="180" />
        <el-table-column prop="email"         label="Email"       min-width="200" />
        <el-table-column prop="phone"         label="Phone"       width="130" />
        <el-table-column label="Membership"   width="130">
          <template #default="{ row }">
            <el-tag v-if="row.membershipTier" size="small">{{ row.membershipTier.name }}</el-tag>
            <span v-else class="muted">None</span>
          </template>
        </el-table-column>
        <el-table-column prop="growthPoints"  label="Points"      width="80" />
        <el-table-column label="Stored Value" width="120" v-if="canSeeStoredValue">
          <template #default="{ row }">
            {{ row.storedValueBalance != null ? '$' + row.storedValueBalance.toFixed(2) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="Status" width="90">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? 'Active' : 'Inactive' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="160" v-if="canWrite">
          <template #default="{ row }">
            <el-button size="small" @click="openEditDialog(row)">Edit</el-button>
            <el-button size="small" type="danger" :disabled="!row.isActive" @click="doDeactivate(row)">Deactivate</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[25, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="load"
        />
      </div>
    </el-card>

    <!-- Create / Edit Dialog -->
    <el-dialog v-model="formVisible" :title="editId ? 'Edit Student' : 'Add Student'" width="500px">
      <el-form :model="form" label-position="top">
        <el-form-item v-if="!editId" label="Student Number">
          <el-input v-model="form.studentNumber" placeholder="e.g. S2026001" />
        </el-form-item>
        <el-form-item label="Full Name"><el-input v-model="form.fullName" /></el-form-item>
        <el-form-item label="Email"><el-input v-model="form.email" type="email" /></el-form-item>
        <el-form-item label="Phone (optional)"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="Department (optional)">
          <el-select v-model="form.departmentId" clearable style="width:100%">
            <el-option v-for="d in departments" :key="d.id" :label="`${d.code} — ${d.name}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editId" label="Active"><el-switch v-model="form.isActive" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">Save</el-button>
      </template>
    </el-dialog>

    <!-- Import Dialog -->
    <el-dialog v-model="importVisible" title="Bulk Import Students" width="560px" :close-on-click-modal="false">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px"
        description="Upload .xlsx or .csv. Required columns: studentNumber, fullName, email. Optional: phone, departmentCode, membershipTier." />

      <!-- Template hint -->
      <el-collapse style="margin-bottom:12px">
        <el-collapse-item title="Accepted column names">
          <el-table :data="templateCols" size="small" border>
            <el-table-column prop="field"   label="Field" width="160" />
            <el-table-column prop="aliases" label="Accepted column names" />
            <el-table-column prop="req"     label="Required" width="90" />
          </el-table>
        </el-collapse-item>
      </el-collapse>

      <!-- Upload area — hidden when job is in progress -->
      <template v-if="!importJob">
        <el-upload
          :auto-upload="false"
          accept=".xlsx,.csv"
          :limit="1"
          drag
          :on-change="onFileChange"
          :on-remove="() => selectedFile = null"
        >
          <el-icon style="font-size:40px;color:#c0c4cc"><Upload /></el-icon>
          <div class="el-upload__text">Drop .xlsx or .csv here, or <em>click to browse</em></div>
        </el-upload>
      </template>

      <!-- Job progress while running -->
      <template v-else>
        <el-descriptions :column="2" border size="small" style="margin-bottom:12px">
          <el-descriptions-item label="Status">
            <el-tag :type="jobStatusType" size="small">{{ importJob.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Job ID"><code style="font-size:11px">{{ importJob.id.slice(0,8) }}…</code></el-descriptions-item>
          <el-descriptions-item label="Total rows">{{ importJob.totalRows ?? '…' }}</el-descriptions-item>
          <el-descriptions-item label="Processed"><span class="ok">{{ importJob.processedRows ?? 0 }}</span></el-descriptions-item>
          <el-descriptions-item label="Errors" :span="2">
            <span :class="(importJob.failedRows ?? 0) > 0 ? 'err' : 'ok'">{{ importJob.failedRows ?? 0 }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <el-progress
          :percentage="importJob.progress"
          :status="importJob.status === 'failed' ? 'exception' : importJob.status === 'completed' ? 'success' : undefined"
          :stroke-width="12"
          style="margin-bottom:16px"
        />

        <div v-if="importJob.errorMsg" class="err" style="margin-bottom:12px">{{ importJob.errorMsg }}</div>
      </template>

      <template #footer>
        <el-button @click="closeImport">Close</el-button>
        <el-button
          v-if="importJob?.hasErrorReport"
          type="warning"
          @click="downloadJobErrors"
        >Download Error Report</el-button>
        <el-button
          v-if="importJob?.status === 'failed'"
          type="danger"
          @click="retryImport"
        >Retry</el-button>
        <el-button
          v-if="!importJob || importJob.status === 'completed' || importJob.status === 'failed'"
          type="primary"
          :loading="importing"
          :disabled="!selectedFile && !importJob"
          @click="importJob ? resetImport() : doImport()"
        >{{ importJob ? 'Import Another File' : 'Start Import' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Upload, Download } from '@element-plus/icons-vue';
import { v4 as uuidv4 } from 'uuid';
import { studentApi, departmentApi, type Student, type Department } from '@/api/master-data';
import { jobsApi, type JobRecord } from '@/api/jobs';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canWrite          = computed(() => auth.can('students:write'));
const canSeeStoredValue = computed(() =>
  auth.user?.role === 'administrator' || auth.user?.role === 'operations_manager',
);

// ---- List state ----
const loading      = ref(false);
const students     = ref<Student[]>([]);
const departments  = ref<Department[]>([]);
const total        = ref(0);
const page         = ref(1);
const pageSize     = ref(25);
const search       = ref('');
const filterDept   = ref('');
const filterActive = ref<boolean | undefined>(true);

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedLoad() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(load, 350);
}

async function load() {
  loading.value = true;
  try {
    const res = await studentApi.list({
      search:       search.value       || undefined,
      departmentId: filterDept.value   || undefined,
      active:       filterActive.value,
      page:         page.value,
      limit:        pageSize.value,
    }) as unknown as { data: { data: Student[]; total: number } };
    students.value = res.data.data;
    total.value    = res.data.total;
  } finally { loading.value = false; }
}

// ---- Create / Edit ----
const formVisible = ref(false);
const saving      = ref(false);
const editId      = ref('');
const form = reactive({
  studentNumber: '', fullName: '', email: '', phone: '', departmentId: '', isActive: true,
});

function openCreateDialog() {
  editId.value = '';
  Object.assign(form, { studentNumber: '', fullName: '', email: '', phone: '', departmentId: '', isActive: true });
  formVisible.value = true;
}

function openEditDialog(s: Student) {
  editId.value = s.id;
  Object.assign(form, {
    studentNumber: s.studentNumber ?? '',
    fullName:      s.fullName      ?? '',
    email:         s.email         ?? '',
    phone:         s.phone         ?? '',
    departmentId:  s.departmentId  ?? '',
    isActive:      s.isActive,
  });
  formVisible.value = true;
}

async function doSave() {
  if (!form.fullName || !form.email) { ElMessage.warning('Full Name and Email are required'); return; }
  saving.value = true;
  try {
    if (editId.value) {
      await studentApi.update(editId.value, {
        fullName: form.fullName, email: form.email,
        phone: form.phone || null, departmentId: form.departmentId || null, isActive: form.isActive,
      });
    } else {
      if (!form.studentNumber) { ElMessage.warning('Student Number is required'); return; }
      await studentApi.create(
        { studentNumber: form.studentNumber, fullName: form.fullName, email: form.email,
          phone: form.phone || undefined, departmentId: form.departmentId || undefined },
        uuidv4(),
      );
    }
    ElMessage.success('Saved');
    formVisible.value = false;
    await load();
  } finally { saving.value = false; }
}

async function doDeactivate(s: Student) {
  await ElMessageBox.confirm(`Deactivate student ${s.studentNumber}?`, 'Confirm', { type: 'warning' });
  await studentApi.deactivate(s.id);
  ElMessage.success('Deactivated');
  await load();
}

// ---- Export ----
function doExport() {
  const token = localStorage.getItem('access_token') ?? '';
  fetch(studentApi.exportUrl(), { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `students-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
}

// ---- Import (background job with polling) ----
const importVisible = ref(false);
const importing     = ref(false);
const selectedFile  = ref<File | null>(null);
const importJob     = ref<JobRecord | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const jobStatusType = computed(() => {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    waiting: 'info', active: 'warning', completed: 'success', failed: 'danger', delayed: '',
  };
  return map[importJob.value?.status ?? ''] ?? '';
});

function onFileChange(file: { raw: File }) { selectedFile.value = file.raw; }

async function doImport() {
  if (!selectedFile.value) return;
  importing.value = true;
  try {
    const idempotencyKey = uuidv4();
    const res = await studentApi.import(selectedFile.value, idempotencyKey) as unknown as {
      data: { data: { jobId: string } }
    };
    const jobId = res.data.data.jobId;
    startPollingJob(jobId);
  } catch {
    ElMessage.error('Failed to submit import');
  } finally { importing.value = false; }
}

function startPollingJob(jobId: string) {
  const poll = async () => {
    try {
      const res = await jobsApi.getById(jobId) as unknown as { data: { data: JobRecord } };
      importJob.value = res.data.data;
      if (['completed', 'failed'].includes(importJob.value.status)) {
        stopPoll();
        await load(); // refresh table after import completes
        if (importJob.value.status === 'completed') {
          const r = importJob.value.result;
          ElMessage.success(`Import complete: ${r?.created ?? 0} created, ${r?.updated ?? 0} updated, ${r?.failed ?? 0} errors.`);
        }
      }
    } catch { stopPoll(); }
  };
  poll(); // immediate
  pollTimer = setInterval(poll, 2500);
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function downloadJobErrors() {
  if (!importJob.value) return;
  const res = await jobsApi.downloadErrorReport(importJob.value.id) as unknown as { data: Blob };
  const url = URL.createObjectURL(res.data);
  const a   = document.createElement('a');
  a.href = url; a.download = `import-errors-${importJob.value.id}.csv`; a.click();
  URL.revokeObjectURL(url);
}

async function retryImport() {
  if (!importJob.value) return;
  await jobsApi.retry(importJob.value.id, uuidv4());
  startPollingJob(importJob.value.id);
  ElMessage.info('Retry queued');
}

function resetImport() {
  stopPoll();
  importJob.value   = null;
  selectedFile.value = null;
}

function closeImport() {
  stopPoll();
  importVisible.value = false;
  importJob.value    = null;
  selectedFile.value = null;
}

// Template helper for collapse panel
const templateCols = [
  { field: 'studentNumber', aliases: 'studentNumber, student_number, Student Number', req: 'Yes' },
  { field: 'fullName',      aliases: 'fullName, full_name, Full Name',                req: 'Yes' },
  { field: 'email',         aliases: 'email, Email',                                  req: 'Yes' },
  { field: 'phone',         aliases: 'phone, Phone',                                  req: 'No'  },
  { field: 'departmentCode', aliases: 'departmentCode, department_code, Dept Code',   req: 'No'  },
  { field: 'membershipTier', aliases: 'membershipTier, membership_tier',              req: 'No'  },
];

onMounted(async () => {
  const res = await departmentApi.list(true) as unknown as { data: { data: Department[] } };
  departments.value = res.data.data;
  await load();
});

onUnmounted(() => stopPoll());
</script>

<style scoped>
.page-students  { padding: 0; }
.page-header    { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title     { font-size: 18px; font-weight: 600; }
.header-actions { display: flex; gap: 8px; }
.toolbar        { display: flex; gap: 12px; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.muted { color: #909399; font-size: 13px; }
.ok    { color: #67c23a; font-weight: 600; }
.err   { color: #f56c6c; font-weight: 600; }
</style>
