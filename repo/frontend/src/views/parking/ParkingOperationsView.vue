<template>
  <div class="parking-ops">
    <div class="page-header">
      <h2>Parking Operations</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <el-tag :type="socketConnected ? 'success' : 'warning'" size="small" effect="plain">
          {{ socketConnected ? '⬤ Live' : '○ Reconnecting…' }}
        </el-tag>
        <el-button :icon="RefreshIcon" :loading="loading" @click="loadAll">Refresh</el-button>
      </div>
    </div>

    <div v-if="hasLoadErrors" class="load-errors">
      <div v-if="loadErrors.dashboard" class="load-error-row">
        <el-alert
          type="error"
          show-icon
          :closable="false"
          title="Dashboard load failed"
          :description="loadErrors.dashboard"
        />
        <el-button size="small" type="danger" plain @click="retryDashboard">Retry dashboard</el-button>
      </div>
      <div v-if="loadErrors.alerts" class="load-error-row">
        <el-alert
          type="error"
          show-icon
          :closable="false"
          title="Active alerts load failed"
          :description="loadErrors.alerts"
        />
        <el-button size="small" type="danger" plain @click="retryAlerts">Retry alerts</el-button>
      </div>
      <div v-if="loadErrors.metrics" class="load-error-row">
        <el-alert
          type="error"
          show-icon
          :closable="false"
          title="Metrics load failed"
          :description="loadErrors.metrics"
        />
        <el-button size="small" type="danger" plain @click="retryMetrics">Retry metrics</el-button>
      </div>
    </div>

    <!-- Stats bar -->
    <el-row :gutter="16" class="stats-bar" v-if="dashboard">
      <el-col :span="4">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">Lots</div>
          <div class="stat-value">{{ dashboard.totalLots }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">Total Spaces</div>
          <div class="stat-value">{{ dashboard.totalSpaces }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never" class="stat-card" :class="occupancyClass">
          <div class="stat-label">Occupied</div>
          <div class="stat-value">{{ dashboard.occupiedSpaces }} <small style="font-size:14px">({{ dashboard.occupancyPct }}%)</small></div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never" class="stat-card stat-free">
          <div class="stat-label">Available</div>
          <div class="stat-value">{{ dashboard.availableSpaces }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never" class="stat-card stat-alert">
          <div class="stat-label">Active Alerts</div>
          <div class="stat-value">{{ dashboard.activeAlerts }}</div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card shadow="never" class="stat-card stat-escalated" @click="$router.push('/parking/supervisor-queue')" style="cursor:pointer">
          <div class="stat-label">Escalated</div>
          <div class="stat-value">{{ dashboard.escalatedAlerts }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Metrics bar -->
    <el-row :gutter="16" class="metrics-bar" v-if="metrics">
      <el-col :span="8">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">Alert Creation Rate</div>
          <div class="metric-value">{{ metrics.creationRatePerHour }}/hr</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">Mean Time to Close</div>
          <div class="metric-value">{{ metrics.meanTimeToCloseMin }} min</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">Total Closed (all time)</div>
          <div class="metric-value">{{ metrics.totalClosed }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Lot cards -->
    <h3 class="section-title">Parking Lots</h3>
    <el-row :gutter="16" class="lot-grid">
      <el-col v-for="lot in lots" :key="lot.id" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card shadow="hover" class="lot-card">
          <div class="lot-name">{{ lot.name }}</div>
          <el-progress
            :percentage="lot.occupancyPct"
            :color="occupancyProgressColor(lot.occupancyPct)"
            :stroke-width="10"
          />
          <div class="lot-counts">
            <span class="count-free">{{ lot.availableSpaces }} free</span>
            <span class="count-sep"> / </span>
            <span class="count-total">{{ lot.totalSpaces }} total</span>
          </div>
          <div v-if="lot.activeAlerts > 0" class="lot-alerts">
            <el-tag type="warning" size="small">{{ lot.activeAlerts }} active alert{{ lot.activeAlerts > 1 ? 's' : '' }}</el-tag>
          </div>
          <div class="lot-actions">
            <el-button size="small" @click="showAlertsFor(lot.id)">View Alerts</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Active Alerts table -->
    <h3 class="section-title">
      Active Alerts
      <el-badge :value="activeAlerts.length" type="danger" style="margin-left:8px" />
    </h3>
    <el-table :data="activeAlerts" v-loading="loading" row-key="id" @row-click="openAlertDrawer">
      <el-table-column label="Lot" width="140">
        <template #default="{ row }">{{ row.lot?.name }}</template>
      </el-table-column>
      <el-table-column label="Type" width="160">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ formatType(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Description" min-width="200">
        <template #default="{ row }">{{ row.description }}</template>
      </el-table-column>
      <el-table-column label="Status" width="110">
        <template #default="{ row }">
          <el-tag :type="alertStatusType(row.status)" size="small" effect="dark">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="SLA" width="130">
        <template #default="{ row }">
          <el-tag :type="slaTagType(row.slaStatus)" size="small">
            {{ row.slaStatus === 'closed' ? 'Closed' : slaCountdown(row.msToSlaDeadline) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Age" width="100">
        <template #default="{ row }">{{ fmtAge(row.ageSeconds) }}</template>
      </el-table-column>
      <el-table-column label="Actions" width="200" @click.stop>
        <template #default="{ row }">
          <div style="display:flex;gap:4px" @click.stop>
            <el-button v-if="row.status === 'open'"   size="small" type="primary" @click.stop="handleClaim(row)">Claim</el-button>
            <el-button v-if="row.status === 'claimed'" size="small" type="success" @click.stop="openCloseDialog(row)">Close</el-button>
            <el-button v-if="['open','claimed'].includes(row.status)" size="small" type="danger" plain @click.stop="handleEscalate(row)">Escalate</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- In-app notification banner for escalated alerts -->
    <div v-if="newEscalations.length > 0" class="escalation-banner">
      <el-alert
        v-for="n in newEscalations"
        :key="n.alertId"
        :title="`⚠ Alert escalated — ${n.lotId} — ${n.type}`"
        type="error"
        :closable="true"
        show-icon
        @close="dismissEscalation(n.alertId)"
        class="escalation-item"
      />
    </div>

    <!-- Alert drawer (timeline) -->
    <el-drawer v-model="alertDrawerOpen" title="Alert Detail" size="480px" direction="rtl">
      <template v-if="selectedAlert">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="Type">{{ formatType(selectedAlert.type) }}</el-descriptions-item>
          <el-descriptions-item label="Lot">{{ selectedAlert.lot?.name }}</el-descriptions-item>
          <el-descriptions-item label="Status">
            <el-tag :type="alertStatusType(selectedAlert.status)" size="small" effect="dark">{{ selectedAlert.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="SLA">
            <el-tag :type="slaTagType(selectedAlert.slaStatus)" size="small">{{ slaCountdown(selectedAlert.msToSlaDeadline) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Description">{{ selectedAlert.description }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedAlert.closureNote" label="Closure Note">{{ selectedAlert.closureNote }}</el-descriptions-item>
        </el-descriptions>
        <h4 style="margin:20px 0 12px">Timeline</h4>
        <el-timeline v-if="selectedAlert.timeline?.length">
          <el-timeline-item
            v-for="e in selectedAlert.timeline"
            :key="e.id"
            :timestamp="new Date(e.createdAt).toLocaleString()"
            placement="top"
          >
            <el-card shadow="never"><strong>{{ e.action }}</strong>
              <p v-if="e.note" style="margin:4px 0 0;font-size:13px;color:#606266">{{ e.note }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="No timeline events" />
      </template>
    </el-drawer>

    <!-- Close alert dialog -->
    <el-dialog v-model="closeDialogOpen" title="Close Alert" width="440px">
      <el-form label-position="top">
        <el-form-item label="Closure Note" :error="closeNoteError" required>
          <el-input v-model="closureNote" type="textarea" :rows="3"
            placeholder="Describe how the alert was resolved (min 5 characters)…"
            @input="validateCloseNote" />
          <div style="text-align:right;font-size:11px;color:#909399;margin-top:4px">{{ closureNote.length }} / 5 min</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialogOpen = false">Cancel</el-button>
        <el-button type="success" :loading="dialogLoading" :disabled="closureNote.length < 5" @click="confirmClose">Close Alert</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh as RefreshIcon } from '@element-plus/icons-vue';
import { parkingApi, parkingAlertApi } from '../../api/parking';
import type { ParkingAlert, ParkingDashboard, ParkingLot, AlertMetrics, ParkingAlertStatus } from '../../api/parking';
import { useParkingSocket } from '../../composables/useParkingSocket';

const loading       = ref(false);
const dashboard     = ref<ParkingDashboard | null>(null);
const lots          = ref<ParkingLot[]>([]);
const activeAlerts  = ref<ParkingAlert[]>([]);
const metrics       = ref<AlertMetrics | null>(null);
const newEscalations = ref<{ alertId: string; lotId: string; type: string }[]>([]);
type LoadErrorKey = 'dashboard' | 'alerts' | 'metrics';
const loadErrors = ref<Record<LoadErrorKey, string | null>>({
  dashboard: null,
  alerts: null,
  metrics: null,
});

const alertDrawerOpen = ref(false);
const selectedAlert   = ref<ParkingAlert | null>(null);
const closeDialogOpen = ref(false);
const closeTarget     = ref<ParkingAlert | null>(null);
const closureNote     = ref('');
const closeNoteError  = ref('');
const dialogLoading   = ref(false);

// SLA countdown interval
let slaInterval: ReturnType<typeof setInterval> | null = null;
const slaTickRef = ref(0); // forces reactivity refresh

const { connected: socketConnected, onAlertCreated, onAlertUpdated } = useParkingSocket();

const hasLoadErrors = computed(() =>
  Boolean(loadErrors.value.dashboard || loadErrors.value.alerts || loadErrors.value.metrics),
);

onAlertCreated.value = (evt) => {
  ElMessage.warning({ message: `New alert: ${evt.type} at lot ${evt.lotId}`, duration: 5000 });
  loadAlerts();
  loadDashboard();
};

onAlertUpdated.value = (evt) => {
  if (evt.status === 'escalated') {
    newEscalations.value.push({ alertId: evt.alertId, lotId: evt.lotId ?? '', type: evt.type ?? '' });
    // Audible alert (workstation beep via AudioContext)
    try { playBeep(); } catch { /* ignore if AudioContext not available */ }
  }
  const idx = activeAlerts.value.findIndex(a => a.id === evt.alertId);
  if (idx !== -1) loadAlerts(); // reload to get fresh data
};

function toErrorMessage(err: unknown, fallback: string): string {
  const responseError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (responseError) return responseError;
  const directMessage = (err as { message?: string })?.message;
  return directMessage || fallback;
}

function reportLoaderError(section: LoadErrorKey, err: unknown, fallback: string) {
  const message = toErrorMessage(err, fallback);
  loadErrors.value[section] = message;
  console.error('parking-ops loader failure', {
    section,
    message,
    error: err,
  });
}

async function loadDashboard() {
  loadErrors.value.dashboard = null;
  try {
    const res = await parkingApi.dashboard();
    dashboard.value = res.data.data;
    lots.value = res.data.data.lots;
  } catch (err: unknown) {
    reportLoaderError('dashboard', err, 'Unable to load dashboard data');
  }
}

async function loadAlerts() {
  loadErrors.value.alerts = null;
  try {
    const res = await parkingAlertApi.list({ status: 'open,claimed', limit: 100 });
    activeAlerts.value = res.data.data;
  } catch (err: unknown) {
    reportLoaderError('alerts', err, 'Unable to load active alerts');
  }
}

async function loadMetrics() {
  loadErrors.value.metrics = null;
  try {
    const res = await parkingAlertApi.metrics();
    metrics.value = res.data.data;
  } catch (err: unknown) {
    reportLoaderError('metrics', err, 'Unable to load alert metrics');
  }
}

async function loadAll() {
  loading.value = true;
  await Promise.allSettled([loadDashboard(), loadAlerts(), loadMetrics()]);
  loading.value = false;
}

function retryDashboard() {
  return loadDashboard();
}

function retryAlerts() {
  return loadAlerts();
}

function retryMetrics() {
  return loadMetrics();
}

function showAlertsFor(_lotId: string) {
  window.location.hash = '#alerts';
  // Filter handled by query param in a real router setup
  loadAlerts();
}

function openAlertDrawer(row: ParkingAlert) {
  selectedAlert.value = row;
  alertDrawerOpen.value = true;
}

async function handleClaim(row: ParkingAlert) {
  try {
    const res = await parkingAlertApi.claim(row.id);
    const idx = activeAlerts.value.findIndex(a => a.id === row.id);
    if (idx !== -1) activeAlerts.value[idx] = res.data.data;
    ElMessage.success('Alert claimed');
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to claim');
  }
}

function openCloseDialog(row: ParkingAlert) {
  closeTarget.value = row;
  closureNote.value = '';
  closeNoteError.value = '';
  closeDialogOpen.value = true;
}

function validateCloseNote() {
  closeNoteError.value = closureNote.value.length > 0 && closureNote.value.length < 5
    ? `${5 - closureNote.value.length} more character(s) required` : '';
}

async function confirmClose() {
  if (!closeTarget.value || closureNote.value.length < 5) return;
  dialogLoading.value = true;
  try {
    await parkingAlertApi.close(closeTarget.value.id, closureNote.value);
    activeAlerts.value = activeAlerts.value.filter(a => a.id !== closeTarget.value!.id);
    closeDialogOpen.value = false;
    ElMessage.success('Alert closed');
    await Promise.all([loadDashboard(), loadMetrics()]);
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to close');
  } finally { dialogLoading.value = false; }
}

async function handleEscalate(row: ParkingAlert) {
  try {
    await ElMessageBox.confirm('Escalate this alert to supervisor queue?', 'Escalate', { type: 'warning' });
  } catch { return; }
  try {
    await parkingAlertApi.escalate(row.id);
    activeAlerts.value = activeAlerts.value.filter(a => a.id !== row.id);
    ElMessage.warning('Alert escalated to supervisor queue');
    loadDashboard();
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to escalate');
  }
}

function dismissEscalation(alertId: string) {
  newEscalations.value = newEscalations.value.filter(n => n.alertId !== alertId);
}

function playBeep() {
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

const occupancyClass = computed(() => {
  const pct = dashboard.value?.occupancyPct ?? 0;
  return pct > 90 ? 'stat-critical' : pct > 75 ? 'stat-warning' : '';
});

function occupancyProgressColor(pct: number) {
  if (pct > 90) return '#f56c6c';
  if (pct > 75) return '#e6a23c';
  return '#67c23a';
}

function alertStatusType(status: ParkingAlertStatus): '' | 'success' | 'warning' | 'danger' | 'info' {
  return status === 'open' ? 'danger' : status === 'claimed' ? 'warning' : status === 'closed' ? 'success' : 'danger';
}

function slaTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  return s === 'within_sla' ? 'success' : s === 'at_risk' ? 'warning' : s === 'breached' ? 'danger' : 'info';
}

function slaCountdown(ms: number | null): string {
  slaTickRef.value; // force reactivity
  if (ms === null || ms === undefined) return 'No SLA';
  const absMs = Math.abs(ms);
  const min = Math.floor(absMs / 60_000);
  const sec = Math.floor((absMs % 60_000) / 1000);
  const sign = ms < 0 ? '-' : '';
  return `${sign}${min}:${String(sec).padStart(2, '0')}`;
}

function fmtAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

onMounted(() => {
  loadAll();
  slaInterval = setInterval(() => {
    slaTickRef.value++;
    activeAlerts.value.forEach(a => {
      if (a.msToSlaDeadline !== null) a.msToSlaDeadline -= 1000;
    });
  }, 1000);
});

onUnmounted(() => {
  if (slaInterval) clearInterval(slaInterval);
});
</script>

<style scoped>
.parking-ops { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.load-errors { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
.load-error-row { display: flex; align-items: center; gap: 10px; }
.load-error-row :deep(.el-alert) { flex: 1; }
.stats-bar, .metrics-bar { margin-bottom: 20px; }
.stat-card, .metric-card { text-align: center; }
.stat-label, .metric-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.stat-value { font-size: 26px; font-weight: 700; }
.metric-value { font-size: 22px; font-weight: 600; color: #303133; }
.stat-free .stat-value     { color: #67c23a; }
.stat-alert .stat-value    { color: #e6a23c; }
.stat-escalated .stat-value { color: #f56c6c; cursor: pointer; }
.stat-warning .stat-value  { color: #e6a23c; }
.stat-critical .stat-value { color: #f56c6c; }
.section-title { margin: 24px 0 16px; font-size: 16px; font-weight: 600; }
.lot-grid { margin-bottom: 24px; }
.lot-card { margin-bottom: 16px; }
.lot-name { font-weight: 600; margin-bottom: 12px; }
.lot-counts { margin-top: 8px; font-size: 13px; }
.count-free { color: #67c23a; font-weight: 600; }
.count-total { color: #909399; }
.lot-alerts { margin-top: 8px; }
.lot-actions { margin-top: 12px; }
.escalation-banner { position: fixed; top: 72px; right: 16px; width: 380px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; }
.escalation-item { box-shadow: 0 2px 8px rgba(0,0,0,.2); }
</style>
