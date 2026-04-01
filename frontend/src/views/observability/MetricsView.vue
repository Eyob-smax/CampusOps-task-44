<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Metrics & Alerts</h2>
      <el-button plain :loading="refreshing" @click="loadAll">Refresh</el-button>
    </div>

    <!-- Live metric cards -->
    <el-row :gutter="16" style="margin-bottom:24px;">
      <el-col v-for="m in latestMetrics" :key="m.metricName" :span="6" style="margin-bottom:16px;">
        <el-card shadow="never" class="metric-card">
          <div class="metric-name">{{ formatMetricName(m.metricName) }}</div>
          <div class="metric-value">{{ formatMetricValue(m) }}</div>
          <div class="metric-time">{{ new Date(m.capturedAt).toLocaleTimeString() }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <!-- Threshold Rules -->
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>Alert Thresholds</span>
              <el-button size="small" type="primary" @click="openCreateThreshold">+ Add Rule</el-button>
            </div>
          </template>
          <el-table :data="thresholds" size="small" stripe>
            <el-table-column label="Metric" prop="metricName" min-width="200" />
            <el-table-column label="Rule" width="140">
              <template #default="{ row }">{{ row.operator }} {{ row.value }}</template>
            </el-table-column>
            <el-table-column label="Active" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
                  {{ row.isActive ? 'Yes' : 'No' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="" width="80">
              <template #default="{ row }">
                <el-button size="small" type="danger" plain @click="deleteThreshold(row.id)">Del</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <!-- Alert History -->
      <el-col :span="12">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>Alert History</span>
              <el-badge :value="unacknowledgedCount" :hidden="!unacknowledgedCount">
                <el-tag type="danger" size="small">{{ unacknowledgedCount }} unacked</el-tag>
              </el-badge>
            </div>
          </template>
          <el-table :data="alertHistory" size="small" stripe>
            <el-table-column label="Metric" prop="metricName" min-width="160" />
            <el-table-column label="Value" width="90">
              <template #default="{ row }">{{ row.value.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="Time" width="140">
              <template #default="{ row }">{{ new Date(row.createdAt).toLocaleTimeString() }}</template>
            </el-table-column>
            <el-table-column label="" width="100">
              <template #default="{ row }">
                <el-button v-if="!row.isAcknowledged" size="small" @click="acknowledge(row.id)">Ack</el-button>
                <el-tag v-else type="success" size="small">Acked</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- Backup section -->
    <el-card style="margin-top:20px;">
      <template #header>
        <div class="card-header">
          <span>Backup History</span>
          <el-button size="small" type="primary" :loading="backingUp" @click="triggerBackup">Run Backup Now</el-button>
        </div>
      </template>
      <el-table :data="backups" size="small" stripe>
        <el-table-column label="File" prop="fileName" min-width="220" show-overflow-tooltip />
        <el-table-column label="Status" width="120">
          <template #default="{ row }">
            <el-tag :type="backupStatusTag(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Verify" width="110">
          <template #default="{ row }">
            <el-tag :type="verifyStatusTag(row.verifyStatus)" size="small">{{ row.verifyStatus }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Size" width="100">
          <template #default="{ row }">
            {{ row.sizeBytes ? `${(Number(row.sizeBytes) / 1024).toFixed(1)} KB` : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="Started" width="160">
          <template #default="{ row }">{{ new Date(row.startedAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="" width="90">
          <template #default="{ row }">
            <el-button v-if="row.status === 'completed'" size="small" @click="verifyBackup(row.id)">Verify</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Create threshold dialog -->
    <el-dialog v-model="thresholdDialog.visible" title="Add Alert Threshold" width="400px">
      <el-form :model="thresholdForm" label-width="120px">
        <el-form-item label="Metric Name" required>
          <el-input v-model="thresholdForm.metricName" placeholder="e.g. cpu_utilization_percent" />
        </el-form-item>
        <el-form-item label="Operator" required>
          <el-select v-model="thresholdForm.operator" style="width:100%;">
            <el-option v-for="op in ['>','<','>=','<=','==']" :key="op" :label="op" :value="op" />
          </el-select>
        </el-form-item>
        <el-form-item label="Value" required>
          <el-input-number v-model="thresholdForm.value" :precision="2" />
        </el-form-item>
        <el-form-item label="Active">
          <el-switch v-model="thresholdForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="thresholdDialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="savingThreshold"
          :disabled="!thresholdForm.metricName || !thresholdForm.operator"
          @click="submitThreshold">Create</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { metricsApi, thresholdApi, alertHistoryApi, backupApi,
  type MetricSnapshot, type AlertThreshold, type AlertHistoryEntry, type BackupRecord } from '../../api/observability';

const latestMetrics = ref<MetricSnapshot[]>([]);
const thresholds    = ref<AlertThreshold[]>([]);
const alertHistory  = ref<AlertHistoryEntry[]>([]);
const backups       = ref<BackupRecord[]>([]);
const refreshing    = ref(false);
const backingUp     = ref(false);
const savingThreshold = ref(false);

const thresholdDialog = ref({ visible: false });
const thresholdForm   = ref({ metricName: '', operator: '>', value: 0, isActive: true });

const unacknowledgedCount = computed(() => alertHistory.value.filter((a) => !a.isAcknowledged).length);

async function loadAll() {
  refreshing.value = true;
  try {
    await Promise.all([
      metricsApi.getLatest().then((r) => { latestMetrics.value = r.data.data; }),
      thresholdApi.list().then((r) => { thresholds.value = r.data.data; }),
      alertHistoryApi.list({ limit: 20 } as any).then((r) => { alertHistory.value = r.data.data.items; }),
      backupApi.list({ limit: 10 } as any).then((r) => { backups.value = r.data.data.items; }),
    ]);
  } finally {
    refreshing.value = false;
  }
}
onMounted(loadAll);

async function acknowledge(id: string) {
  try {
    await alertHistoryApi.acknowledge(id);
    loadAll();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed');
  }
}

function openCreateThreshold() {
  thresholdForm.value = { metricName: '', operator: '>', value: 0, isActive: true };
  thresholdDialog.value.visible = true;
}

async function submitThreshold() {
  savingThreshold.value = true;
  try {
    await thresholdApi.create(thresholdForm.value);
    ElMessage.success('Threshold created');
    thresholdDialog.value.visible = false;
    loadAll();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed');
  } finally {
    savingThreshold.value = false;
  }
}

async function deleteThreshold(id: string) {
  try {
    await thresholdApi.delete(id);
    ElMessage.success('Deleted');
    loadAll();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed');
  }
}

async function triggerBackup() {
  backingUp.value = true;
  try {
    await backupApi.trigger();
    ElMessage.success('Backup started');
    loadAll();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to start backup');
  } finally {
    backingUp.value = false;
  }
}

async function verifyBackup(id: string) {
  try {
    const res = await backupApi.verify(id);
    ElMessage[res.data.data.passed ? 'success' : 'error'](
      res.data.data.passed ? 'Verification passed' : `Verification failed: ${res.data.data.details}`
    );
    loadAll();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Verification error');
  }
}

function formatMetricName(n: string) {
  return n.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatMetricValue(m: MetricSnapshot) {
  if (m.metricName.includes('percent')) return `${m.value.toFixed(1)}%`;
  if (m.metricName.includes('mb')) return `${m.value.toFixed(0)} MB`;
  return m.value.toFixed(m.value < 100 ? 2 : 0);
}
function backupStatusTag(s: string): '' | 'success' | 'danger' | 'info' {
  return s === 'completed' ? 'success' : s === 'failed' ? 'danger' : 'info';
}
function verifyStatusTag(s: string): '' | 'success' | 'danger' | 'info' {
  return s === 'passed' ? 'success' : s === 'failed' ? 'danger' : 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.metric-card { text-align: center; }
.metric-name { font-size: 12px; color: #909399; margin-bottom: 4px; }
.metric-value { font-size: 28px; font-weight: 700; color: #303133; }
.metric-time { font-size: 11px; color: #c0c4cc; margin-top: 4px; }
</style>
