<template>
  <div class="dashboard">
    <h2 class="dashboard-title">Operations Dashboard</h2>

    <!-- Error banner -->
    <el-alert
      v-if="globalError"
      :title="globalError"
      type="error"
      show-icon
      closable
      class="dashboard-error"
      @close="globalError = ''"
    />

    <!-- ===================== TOP ROW: Stat Cards ===================== -->
    <el-row :gutter="16" class="stat-row">
      <!-- Classroom Status -->
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <template #header>
            <span class="card-header">Classroom Status</span>
          </template>
          <el-skeleton :rows="2" animated :loading="loading.classrooms">
            <template #default>
              <div v-if="classroomStats" class="stat-grid">
                <el-statistic title="Online" :value="classroomStats.online">
                  <template #suffix>
                    <el-tag type="success" size="small" effect="plain"
                      >OK</el-tag
                    >
                  </template>
                </el-statistic>
                <el-statistic title="Offline" :value="classroomStats.offline">
                  <template #suffix>
                    <el-tag type="danger" size="small" effect="plain"
                      >DOWN</el-tag
                    >
                  </template>
                </el-statistic>
                <el-statistic title="Degraded" :value="classroomStats.degraded">
                  <template #suffix>
                    <el-tag type="warning" size="small" effect="plain"
                      >WARN</el-tag
                    >
                  </template>
                </el-statistic>
                <el-statistic title="Total" :value="classroomStats.total" />
              </div>
              <el-empty
                v-else
                description="No classroom data"
                :image-size="40"
              />
            </template>
          </el-skeleton>
        </el-card>
      </el-col>

      <!-- Parking Occupancy -->
      <el-col v-if="auth.can('parking:read')" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <template #header>
            <span class="card-header">Parking Occupancy</span>
          </template>
          <el-skeleton :rows="2" animated :loading="loading.parking">
            <template #default>
              <div v-if="parkingDashboard" class="stat-grid">
                <el-statistic
                  title="Occupied"
                  :value="parkingDashboard.occupiedSpaces"
                />
                <el-statistic
                  title="Total Spaces"
                  :value="parkingDashboard.totalSpaces"
                />
                <el-statistic
                  title="Occupancy"
                  :value="parkingDashboard.occupancyPct"
                  :precision="1"
                >
                  <template #suffix>%</template>
                </el-statistic>
                <el-statistic
                  title="Available"
                  :value="parkingDashboard.availableSpaces"
                />
              </div>
              <el-empty v-else description="No parking data" :image-size="40" />
            </template>
          </el-skeleton>
        </el-card>
      </el-col>

      <!-- Active Alerts -->
      <el-col :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <template #header>
            <span class="card-header">Active Alerts</span>
          </template>
          <el-skeleton
            :rows="2"
            animated
            :loading="loading.classrooms || loading.parking"
          >
            <template #default>
              <div class="stat-grid">
                <el-statistic
                  title="Anomalies"
                  :value="classroomStats?.activeAnomalies ?? 0"
                />
                <el-statistic
                  v-if="auth.can('parking:read')"
                  title="Parking Alerts"
                  :value="parkingDashboard?.activeAlerts ?? 0"
                />
                <el-statistic title="Total" :value="totalActiveAlerts">
                  <template #suffix>
                    <el-tag
                      :type="totalActiveAlerts > 0 ? 'danger' : 'success'"
                      size="small"
                      effect="plain"
                    >
                      {{ totalActiveAlerts > 0 ? "ACTION" : "CLEAR" }}
                    </el-tag>
                  </template>
                </el-statistic>
              </div>
            </template>
          </el-skeleton>
        </el-card>
      </el-col>

      <!-- Fulfillment Requests -->
      <el-col v-if="auth.can('fulfillment:read')" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="stat-card">
          <template #header>
            <span class="card-header">Fulfillment Requests</span>
          </template>
          <el-skeleton :rows="2" animated :loading="loading.fulfillment">
            <template #default>
              <div class="stat-grid">
                <el-statistic title="Pending" :value="pendingFulfillmentCount">
                  <template #suffix>
                    <el-tag
                      :type="
                        pendingFulfillmentCount > 0 ? 'warning' : 'success'
                      "
                      size="small"
                      effect="plain"
                    >
                      {{ pendingFulfillmentCount > 0 ? "QUEUED" : "CLEAR" }}
                    </el-tag>
                  </template>
                </el-statistic>
              </div>
            </template>
          </el-skeleton>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===================== MIDDLE ROW: Tables ===================== -->
    <el-row :gutter="16" class="table-row">
      <!-- Recent Anomalies -->
      <el-col v-if="auth.can('classroom:read')" :xs="24" :lg="12">
        <el-card shadow="hover" class="table-card">
          <template #header>
            <span class="card-header">Recent Anomalies</span>
          </template>
          <el-skeleton :rows="5" animated :loading="loading.anomalies">
            <template #default>
              <el-table
                v-if="recentAnomalies.length"
                :data="recentAnomalies"
                stripe
                size="small"
                class="dashboard-table"
              >
                <el-table-column prop="status" label="Status" width="110">
                  <template #default="{ row }">
                    <el-tag
                      :type="anomalyStatusType(row.status)"
                      size="small"
                      effect="light"
                    >
                      {{ row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="type" label="Type" min-width="120" />
                <el-table-column label="Classroom" min-width="140">
                  <template #default="{ row }">
                    {{
                      row.classroom?.class?.name ??
                      row.classroom?.hardwareNodeId ??
                      "-"
                    }}
                  </template>
                </el-table-column>
                <el-table-column label="Created" width="150">
                  <template #default="{ row }">
                    {{ formatDate(row.createdAt) }}
                  </template>
                </el-table-column>
              </el-table>
              <el-empty
                v-else
                description="No recent anomalies"
                :image-size="60"
              />
            </template>
          </el-skeleton>
        </el-card>
      </el-col>

      <!-- Parking Alerts -->
      <el-col v-if="auth.can('parking:read')" :xs="24" :lg="12">
        <el-card shadow="hover" class="table-card">
          <template #header>
            <span class="card-header">Parking Alerts</span>
          </template>
          <el-skeleton :rows="5" animated :loading="loading.parkingAlerts">
            <template #default>
              <el-table
                v-if="recentParkingAlerts.length"
                :data="recentParkingAlerts"
                stripe
                size="small"
                class="dashboard-table"
              >
                <el-table-column prop="type" label="Type" min-width="140">
                  <template #default="{ row }">
                    {{ formatAlertType(row.type) }}
                  </template>
                </el-table-column>
                <el-table-column label="Lot" min-width="100">
                  <template #default="{ row }">
                    {{ row.lot?.name ?? "-" }}
                  </template>
                </el-table-column>
                <el-table-column prop="status" label="Status" width="100">
                  <template #default="{ row }">
                    <el-tag
                      :type="row.status === 'open' ? 'danger' : 'warning'"
                      size="small"
                      effect="light"
                    >
                      {{ row.status }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="SLA" width="110">
                  <template #default="{ row }">
                    <el-tag
                      :type="slaTagType(row.slaStatus)"
                      size="small"
                      effect="light"
                    >
                      {{ formatSla(row.slaStatus) }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
              <el-empty
                v-else
                description="No open parking alerts"
                :image-size="60"
              />
            </template>
          </el-skeleton>
        </el-card>
      </el-col>
    </el-row>

    <!-- ===================== BOTTOM ROW: System Health ===================== -->
    <el-row v-if="auth.can('metrics:read')" :gutter="16" class="health-row">
      <el-col :span="24">
        <el-card shadow="hover" class="table-card">
          <template #header>
            <span class="card-header">System Health</span>
          </template>
          <el-skeleton :rows="3" animated :loading="loading.metrics">
            <template #default>
              <el-table
                v-if="latestMetrics.length"
                :data="latestMetrics"
                stripe
                size="small"
                class="dashboard-table"
              >
                <el-table-column
                  prop="metricName"
                  label="Metric"
                  min-width="200"
                />
                <el-table-column prop="value" label="Value" width="140">
                  <template #default="{ row }">
                    {{ formatMetricValue(row.value) }}
                  </template>
                </el-table-column>
                <el-table-column label="Labels" min-width="180">
                  <template #default="{ row }">
                    {{ row.labels ?? "-" }}
                  </template>
                </el-table-column>
                <el-table-column label="Captured At" width="180">
                  <template #default="{ row }">
                    {{ formatDate(row.capturedAt) }}
                  </template>
                </el-table-column>
              </el-table>
              <el-empty
                v-else
                description="No metrics available"
                :image-size="60"
              />
            </template>
          </el-skeleton>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from "vue";
import { classroomApi, anomalyApi } from "../api/classroom";
import type { ClassroomStats, Anomaly, AnomalyStatus } from "../api/classroom";
import { parkingApi, parkingAlertApi } from "../api/parking";
import type { ParkingDashboard, ParkingAlert, SlaSatus } from "../api/parking";
import { fulfillmentApi } from "../api/fulfillment";
import { metricsApi } from "../api/observability";
import type { MetricSnapshot } from "../api/observability";
import { useAuthStore } from "../stores/auth";

const auth = useAuthStore();

// ---- Reactive state ----
const classroomStats = ref<ClassroomStats | null>(null);
const parkingDashboard = ref<ParkingDashboard | null>(null);
const recentAnomalies = ref<Anomaly[]>([]);
const recentParkingAlerts = ref<ParkingAlert[]>([]);
const pendingFulfillmentCount = ref(0);
const latestMetrics = ref<MetricSnapshot[]>([]);
const globalError = ref("");

const loading = reactive({
  classrooms: false,
  parking: false,
  anomalies: false,
  parkingAlerts: false,
  fulfillment: false,
  metrics: false,
});

// ---- Computed ----
const totalActiveAlerts = computed(() => {
  const anomalies = classroomStats.value?.activeAnomalies ?? 0;
  const parking = auth.can("parking:read")
    ? (parkingDashboard.value?.activeAlerts ?? 0)
    : 0;
  return anomalies + parking;
});

// ---- Formatters ----
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatAlertType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function anomalyStatusType(
  status: AnomalyStatus,
): "danger" | "warning" | "info" | "success" | "" {
  const map: Record<
    AnomalyStatus,
    "danger" | "warning" | "info" | "success" | ""
  > = {
    open: "danger",
    acknowledged: "warning",
    assigned: "",
    escalated: "danger",
    resolved: "success",
  };
  return map[status] ?? "info";
}

function slaTagType(sla: SlaSatus): "success" | "warning" | "danger" | "info" {
  const map: Record<SlaSatus, "success" | "warning" | "danger" | "info"> = {
    within_sla: "success",
    at_risk: "warning",
    breached: "danger",
    closed: "info",
  };
  return map[sla] ?? "info";
}

function formatSla(sla: SlaSatus): string {
  return sla.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Data fetching ----
async function fetchClassroomStats() {
  if (!auth.can("classroom:read")) return;
  loading.classrooms = true;
  try {
    const res = await classroomApi.stats();
    classroomStats.value = res.data.data;
  } catch (err: any) {
    console.error("Failed to load classroom stats", err);
  } finally {
    loading.classrooms = false;
  }
}

async function fetchParkingDashboard() {
  if (!auth.can("parking:read")) return;
  loading.parking = true;
  try {
    const res = await parkingApi.dashboard();
    parkingDashboard.value = res.data.data;
  } catch (err: any) {
    console.error("Failed to load parking dashboard", err);
  } finally {
    loading.parking = false;
  }
}

async function fetchRecentAnomalies() {
  if (!auth.can("classroom:read")) return;
  loading.anomalies = true;
  try {
    const res = await anomalyApi.list({ limit: 5 });
    recentAnomalies.value = res.data.data ?? [];
  } catch (err: any) {
    console.error("Failed to load anomalies", err);
  } finally {
    loading.anomalies = false;
  }
}

async function fetchParkingAlerts() {
  if (!auth.can("parking:read")) return;
  loading.parkingAlerts = true;
  try {
    const res = await parkingAlertApi.list({
      status: "open,claimed",
      limit: 5,
    });
    recentParkingAlerts.value = res.data.data ?? [];
  } catch (err: any) {
    console.error("Failed to load parking alerts", err);
  } finally {
    loading.parkingAlerts = false;
  }
}

async function fetchFulfillmentPending() {
  if (!auth.can("fulfillment:read")) return;
  loading.fulfillment = true;
  try {
    const res = await fulfillmentApi.list({ status: "pending", limit: 1 });
    pendingFulfillmentCount.value = res.data.data?.total ?? 0;
  } catch (err: any) {
    console.error("Failed to load fulfillment data", err);
  } finally {
    loading.fulfillment = false;
  }
}

async function fetchMetrics() {
  if (!auth.can("metrics:read")) return;
  loading.metrics = true;
  try {
    const res = await metricsApi.getLatest();
    latestMetrics.value = res.data.data ?? [];
  } catch (err: any) {
    console.error("Failed to load metrics", err);
  } finally {
    loading.metrics = false;
  }
}

async function fetchAll() {
  globalError.value = "";
  try {
    await Promise.all([
      fetchClassroomStats(),
      fetchParkingDashboard(),
      fetchRecentAnomalies(),
      fetchParkingAlerts(),
      fetchFulfillmentPending(),
      fetchMetrics(),
    ]);
  } catch (err: any) {
    globalError.value =
      "Some dashboard data failed to load. Please try refreshing.";
  }
}

// ---- Auto-refresh ----
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const REFRESH_INTERVAL_MS = 30_000;

onMounted(() => {
  fetchAll();
  refreshTimer = setInterval(fetchAll, REFRESH_INTERVAL_MS);
});

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<style scoped>
.dashboard {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.dashboard-title {
  margin: 0 0 20px 0;
  font-size: 22px;
  font-weight: 600;
  color: #303133;
}

.dashboard-error {
  margin-bottom: 16px;
}

.stat-row {
  margin-bottom: 16px;
}

.stat-card {
  height: 100%;
  margin-bottom: 16px;
}

.stat-card :deep(.el-card__header) {
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.card-header {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-grid :deep(.el-statistic__head) {
  font-size: 12px;
  color: #909399;
}

.stat-grid :deep(.el-statistic__number) {
  font-size: 22px;
  font-weight: 600;
}

.table-row {
  margin-bottom: 16px;
}

.table-card {
  margin-bottom: 16px;
}

.table-card :deep(.el-card__header) {
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.table-card :deep(.el-card__body) {
  padding: 0;
}

.dashboard-table {
  width: 100%;
}

.dashboard-table :deep(.el-table__header th) {
  background: #f5f7fa;
  font-weight: 600;
  font-size: 12px;
  color: #606266;
}

.health-row {
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .dashboard {
    padding: 12px;
  }

  .stat-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
