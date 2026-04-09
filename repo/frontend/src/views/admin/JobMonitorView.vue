<template>
  <div class="page-jobs">
    <div class="page-header">
      <span class="page-title">Job Monitor</span>
      <div class="header-right">
        <el-tag v-if="hasActive" type="warning" effect="plain">
          <el-icon class="spin"><Loading /></el-icon> {{ activeCount }} running
        </el-tag>
        <el-button :icon="Refresh" :loading="loading" @click="load">Refresh</el-button>
      </div>
    </div>

    <!-- Filters -->
    <el-card shadow="never" style="margin-bottom:12px">
      <div class="toolbar">
        <el-select v-model="filterStatus" placeholder="All Statuses" clearable style="width:160px" @change="load">
          <el-option label="Waiting"   value="waiting" />
          <el-option label="Active"    value="active" />
          <el-option label="Completed" value="completed" />
          <el-option label="Failed"    value="failed" />
          <el-option label="Delayed"   value="delayed" />
        </el-select>
        <el-select v-model="filterQueue" placeholder="All Queues" clearable style="width:220px" @change="load">
          <el-option label="bulk-import"        value="campusops-bulk-import" />
          <el-option label="shipment-sync"      value="campusops-shipment-sync" />
          <el-option label="escalation-checker" value="campusops-escalation-checker" />
          <el-option label="parking-sla-check"  value="campusops-parking-sla-check" />
          <el-option label="backup"             value="campusops-backup" />
          <el-option label="metric-alert-check" value="campusops-metric-alert-check" />
          <el-option label="log-retention"      value="campusops-log-retention" />
        </el-select>
        <el-date-picker
          v-model="filterDateRange"
          type="daterange"
          range-separator="—"
          start-placeholder="From"
          end-placeholder="To"
          value-format="YYYY-MM-DD"
          style="width:280px"
          @change="load"
        />
      </div>
    </el-card>

    <!-- Table -->
    <el-card shadow="never" v-loading="loading">
      <el-table
        :data="jobs"
        stripe
        border
        style="width:100%"
        :row-class-name="rowClass"
        @row-click="openDetail"
      >
        <el-table-column label="Job" min-width="200">
          <template #default="{ row }">
            <div class="job-name">{{ fmtJobName(row.jobName) }}</div>
            <div class="job-sub">{{ row.inputFilename ?? row.queueName }}</div>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="110">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Progress" width="180">
          <template #default="{ row }">
            <el-progress
              :percentage="row.progress"
              :status="row.status === 'failed' ? 'exception' : row.status === 'completed' ? 'success' : undefined"
              :stroke-width="8"
            />
          </template>
        </el-table-column>

        <el-table-column label="Rows" width="130">
          <template #default="{ row }">
            <span v-if="row.totalRows != null">
              <span class="ok">{{ row.processedRows ?? 0 }}</span> /
              {{ row.totalRows }}
              <span v-if="(row.failedRows ?? 0) > 0" class="err"> ({{ row.failedRows }} err)</span>
            </span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>

        <el-table-column label="Attempts" width="80" align="center">
          <template #default="{ row }">{{ row.attempts }}/{{ row.maxAttempts }}</template>
        </el-table-column>

        <el-table-column label="Started" width="145">
          <template #default="{ row }">{{ row.startedAt ? fmtDate(row.startedAt) : '—' }}</template>
        </el-table-column>

        <el-table-column label="Finished" width="145">
          <template #default="{ row }">{{ row.finishedAt ? fmtDate(row.finishedAt) : '—' }}</template>
        </el-table-column>

        <el-table-column label="Duration" width="90" align="right">
          <template #default="{ row }">{{ fmtDuration(row) }}</template>
        </el-table-column>

        <el-table-column label="Actions" width="140">
          <template #default="{ row }">
            <el-button
              v-if="row.hasErrorReport"
              size="small"
              type="warning"
              @click.stop="downloadReport(row)"
            >Errors CSV</el-button>
            <el-button
              v-if="row.status === 'failed'"
              size="small"
              type="danger"
              @click.stop="doRetry(row)"
            >Retry</el-button>
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

    <!-- Detail drawer -->
    <el-drawer v-model="drawerVisible" :title="selectedJob?.jobName ?? 'Job Detail'" size="480px" direction="rtl">
      <template v-if="selectedJob">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="ID"><code>{{ selectedJob.id }}</code></el-descriptions-item>
          <el-descriptions-item label="Queue">{{ selectedJob.queueName }}</el-descriptions-item>
          <el-descriptions-item label="BullMQ Job ID">{{ selectedJob.bullJobId ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="Status">
            <el-tag :type="statusType(selectedJob.status)" size="small">{{ selectedJob.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Progress">
            <el-progress :percentage="selectedJob.progress" :stroke-width="10" style="width:200px" />
          </el-descriptions-item>
          <el-descriptions-item label="File">{{ selectedJob.inputFilename ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="Total Rows">{{ selectedJob.totalRows ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="Processed">
            <span class="ok">{{ selectedJob.processedRows ?? 0 }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Failed">
            <span :class="(selectedJob.failedRows ?? 0) > 0 ? 'err' : 'ok'">{{ selectedJob.failedRows ?? 0 }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="Created">{{ fmtDate(selectedJob.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="Started">{{ selectedJob.startedAt ? fmtDate(selectedJob.startedAt) : '—' }}</el-descriptions-item>
          <el-descriptions-item label="Finished">{{ selectedJob.finishedAt ? fmtDate(selectedJob.finishedAt) : '—' }}</el-descriptions-item>
          <el-descriptions-item label="Duration">{{ fmtDuration(selectedJob) }}</el-descriptions-item>
          <el-descriptions-item label="Attempts">{{ selectedJob.attempts }} / {{ selectedJob.maxAttempts }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedJob.result" label="Result">
            <span v-if="selectedJob.result.created !== undefined">
              Created: <span class="ok">{{ selectedJob.result.created }}</span>,
              Updated: <span class="ok">{{ selectedJob.result.updated }}</span>,
              Errors: <span :class="(selectedJob.result.failed ?? 0) > 0 ? 'err' : 'ok'">{{ selectedJob.result.failed }}</span>
            </span>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="selectedJob.errorMsg"
          type="error"
          :title="selectedJob.errorMsg"
          :closable="false"
          show-icon
          style="margin-top:16px"
        />

        <div class="drawer-actions">
          <el-button
            v-if="selectedJob.hasErrorReport"
            type="warning"
            @click="downloadReport(selectedJob)"
          >Download Error Report CSV</el-button>
          <el-button
            v-if="selectedJob.status === 'failed'"
            type="danger"
            @click="doRetry(selectedJob)"
          >Retry Job</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh, Loading } from '@element-plus/icons-vue';
import { v4 as uuidv4 } from 'uuid';
import { jobsApi, type JobRecord } from '@/api/jobs';

const loading       = ref(false);
const jobs          = ref<JobRecord[]>([]);
const total         = ref(0);
const page          = ref(1);
const pageSize      = ref(25);
const filterStatus  = ref('');
const filterQueue   = ref('');
const filterDateRange = ref<string[]>([]);
const drawerVisible = ref(false);
const selectedJob   = ref<JobRecord | null>(null);

const activeCount = computed(() => jobs.value.filter(j => j.status === 'active' || j.status === 'waiting').length);
const hasActive   = computed(() => activeCount.value > 0);

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function load() {
  loading.value = true;
  try {
    const params: Record<string, unknown> = {
      page:   page.value,
      limit:  pageSize.value,
    };
    if (filterStatus.value) params['status'] = filterStatus.value;
    if (filterQueue.value)  params['queue']  = filterQueue.value;
    if (filterDateRange.value?.[0]) params['from'] = filterDateRange.value[0];
    if (filterDateRange.value?.[1]) params['to']   = filterDateRange.value[1];

    const res = await jobsApi.list(params as any) as unknown as { data: { data: { data: JobRecord[] }; total: number } };
    const payload = (res as any).data;
    jobs.value = payload.data ?? [];
    total.value = payload.total ?? 0;

    // If a detail drawer is open, refresh its data too
    if (selectedJob.value) {
      const refreshed = jobs.value.find(j => j.id === selectedJob.value!.id);
      if (refreshed) selectedJob.value = refreshed;
    }
  } finally { loading.value = false; }
}

function startPolling() {
  pollTimer = setInterval(async () => {
    if (hasActive.value || drawerVisible.value) {
      await load();
    }
  }, 4000);
}

function openDetail(row: JobRecord) {
  selectedJob.value = row;
  drawerVisible.value = true;
}

function rowClass({ row }: { row: JobRecord }) {
  if (row.status === 'failed')    return 'row-failed';
  if (row.status === 'active')    return 'row-active';
  if (row.status === 'completed') return 'row-done';
  return '';
}

function statusType(status: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    waiting:   'info',
    active:    'warning',
    completed: 'success',
    failed:    'danger',
    delayed:   '',
  };
  return map[status] ?? '';
}

function fmtJobName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(job: JobRecord): string {
  if (!job.startedAt) return '—';
  const end = job.finishedAt ? new Date(job.finishedAt) : new Date();
  const ms  = end.getTime() - new Date(job.startedAt).getTime();
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

async function downloadReport(job: JobRecord) {
  try {
    const res = await jobsApi.downloadErrorReport(job.id) as unknown as { data: Blob };
    const url = URL.createObjectURL(res.data);
    const a   = document.createElement('a');
    a.href = url; a.download = `error-report-${job.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  } catch {
    ElMessage.error('Failed to download error report');
  }
}

async function doRetry(job: JobRecord) {
  try {
    await jobsApi.retry(job.id, uuidv4());
    ElMessage.success('Job queued for retry');
    await load();
  } catch {
    ElMessage.error('Retry failed — source file may have expired. Re-upload required.');
  }
}

onMounted(async () => {
  await load();
  startPolling();
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.page-jobs { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title  { font-size: 18px; font-weight: 600; }
.header-right { display: flex; align-items: center; gap: 12px; }
.toolbar { display: flex; gap: 12px; flex-wrap: wrap; }
.pagination-bar { display: flex; justify-content: flex-end; margin-top: 16px; }
.job-name { font-weight: 500; font-size: 13px; }
.job-sub  { font-size: 11px; color: #909399; margin-top: 2px; }
.ok  { color: #67c23a; font-weight: 600; }
.err { color: #f56c6c; font-weight: 600; }
.muted { color: #909399; }
.drawer-actions { display: flex; gap: 12px; margin-top: 24px; }
.spin { animation: spin 1.2s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

<style>
.row-failed td { background: #fff0f0 !important; }
.row-active td { background: #fffbe6 !important; }
</style>
