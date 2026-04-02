<template>
  <div class="classroom-ops">
    <div class="page-header">
      <h2>Classroom Operations</h2>
      <el-button :icon="RefreshIcon" :loading="loading" @click="loadAll">Refresh</el-button>
    </div>

    <!-- Stats bar -->
    <el-row :gutter="16" class="stats-bar">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-label">Total Classrooms</div>
          <div class="stat-value">{{ stats.total }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-online">
          <div class="stat-label">Online</div>
          <div class="stat-value">{{ stats.online }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-offline">
          <div class="stat-label">Offline</div>
          <div class="stat-value">{{ stats.offline }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card stat-anomaly">
          <div class="stat-label">Active Anomalies</div>
          <div class="stat-value">{{ stats.activeAnomalies }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Filters -->
    <el-row :gutter="12" class="filters">
      <el-col :span="8">
        <el-input v-model="search" placeholder="Search by class name or room..." clearable @change="loadClassrooms" />
      </el-col>
      <el-col :span="5">
        <el-select v-model="statusFilter" placeholder="All statuses" clearable @change="loadClassrooms">
          <el-option label="Online" value="online" />
          <el-option label="Offline" value="offline" />
          <el-option label="Degraded" value="degraded" />
        </el-select>
      </el-col>
      <el-col :span="5">
        <el-select v-model="deptFilter" placeholder="All departments" clearable @change="loadClassrooms">
          <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
      </el-col>
    </el-row>

    <!-- Classroom grid -->
    <div v-if="loading && classrooms.length === 0" class="loading-state">
      <el-skeleton :rows="3" animated />
    </div>

    <div v-else-if="classrooms.length === 0" class="empty-state">
      <el-empty description="No classrooms found" />
    </div>

    <el-row v-else :gutter="16" class="classroom-grid">
      <el-col
        v-for="c in classrooms"
        :key="c.id"
        :xs="24" :sm="12" :md="8" :lg="6"
      >
        <el-card
          shadow="hover"
          class="classroom-card"
          :class="`card-${c.status}`"
          @click="goToAnomalies(c.id)"
        >
          <div class="card-top">
            <el-tag :type="statusTagType(c.status)" size="small" effect="dark">
              {{ c.status.toUpperCase() }}
            </el-tag>
            <el-badge v-if="c.openAnomalyCount > 0" :value="c.openAnomalyCount" type="danger" class="anomaly-badge">
              <el-icon class="anomaly-icon"><WarningFilled /></el-icon>
            </el-badge>
          </div>

          <div class="card-name">{{ c.class?.name ?? 'Unknown Class' }}</div>
          <div class="card-meta">
            <span v-if="c.class?.roomNumber">Room {{ c.class.roomNumber }}</span>
            <span v-if="c.class?.department"> · {{ c.class.department.code }}</span>
          </div>
          <div class="card-node">
            <el-text type="info" size="small">Node: {{ c.hardwareNodeId }}</el-text>
          </div>

          <template v-if="c.recognitionConfidence !== null">
            <div class="confidence-label">
              Recognition Confidence: {{ (c.recognitionConfidence * 100).toFixed(1) }}%
            </div>
            <el-progress
              :percentage="Math.round(c.recognitionConfidence * 100)"
              :color="confidenceColor(c.recognitionConfidence, c.confidenceThreshold)"
              :stroke-width="8"
              :show-text="false"
            />
          </template>

          <div class="card-footer">
            <el-text size="small" type="info">
              {{ c.lastHeartbeatAt ? `Last beat: ${fmtAge(c.lastHeartbeatAt)}` : 'No heartbeat' }}
            </el-text>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Pagination -->
    <el-pagination
      v-if="total > limit"
      v-model:current-page="page"
      :page-size="limit"
      :total="total"
      layout="prev, pager, next, total"
      class="pagination"
      @current-change="loadClassrooms"
    />

    <!-- Socket connection indicator -->
    <div class="socket-status">
      <el-tag :type="socketConnected ? 'success' : 'warning'" size="small" effect="plain">
        {{ socketConnected ? '⬤ Live' : '○ Reconnecting…' }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh as RefreshIcon, WarningFilled } from '@element-plus/icons-vue';
import { classroomApi } from '../../api/classroom';
import type { Classroom, ClassroomStats, ClassroomStatus } from '../../api/classroom';
import { departmentApi } from '../../api/master-data';
import type { Department } from '../../api/master-data';
import { useClassroomSocket } from '../../composables/useClassroomSocket';

const router = useRouter();

const classrooms  = ref<Classroom[]>([]);
const departments = ref<Department[]>([]);
const stats       = reactive<ClassroomStats>({ total: 0, online: 0, offline: 0, degraded: 0, activeAnomalies: 0 });
const loading     = ref(false);
const total       = ref(0);
const page        = ref(1);
const limit       = 24;

const search       = ref('');
const statusFilter = ref<ClassroomStatus | ''>('');
const deptFilter   = ref('');

// Socket.IO
const { connected: socketConnected, onClassroomUpdate, onAnomalyCreated } = useClassroomSocket();

onClassroomUpdate.value = (evt) => {
  const idx = classrooms.value.findIndex(c => c.id === evt.id);
  if (idx !== -1) {
    if (evt.status) (classrooms.value[idx] as Record<string, unknown>).status = evt.status;
    if (evt.recognitionConfidence !== undefined) classrooms.value[idx].recognitionConfidence = evt.recognitionConfidence ?? null;
    if (evt.lastHeartbeatAt) classrooms.value[idx].lastHeartbeatAt = evt.lastHeartbeatAt;
  }
  loadStats();
};

onAnomalyCreated.value = (evt) => {
  const idx = classrooms.value.findIndex(c => c.id === evt.classroomId);
  if (idx !== -1) classrooms.value[idx].openAnomalyCount++;
  loadStats();
};

async function loadClassrooms() {
  loading.value = true;
  try {
    const res = await classroomApi.list({
      search:       search.value || undefined,
      status:       (statusFilter.value as ClassroomStatus) || undefined,
      departmentId: deptFilter.value || undefined,
      page:         page.value,
      limit,
    });
    classrooms.value = res.data.data;
    total.value = res.data.total;
  } catch {
    ElMessage.error('Failed to load classrooms');
  } finally {
    loading.value = false;
  }
}

async function loadStats() {
  try {
    const res = await classroomApi.stats();
    Object.assign(stats, res.data.data);
  } catch { /* silently ignore */ }
}

async function loadDepartments() {
  try {
    const res = await departmentApi.list(true);
    departments.value = res.data.data ?? res.data;
  } catch { /* silently ignore */ }
}

async function loadAll() {
  await Promise.all([loadClassrooms(), loadStats(), loadDepartments()]);
}

function goToAnomalies(classroomId: string) {
  router.push({ path: '/classroom/anomalies', query: { classroomId } });
}

function statusTagType(status: ClassroomStatus): '' | 'success' | 'warning' | 'danger' | 'info' {
  return status === 'online' ? 'success' : status === 'degraded' ? 'warning' : 'danger';
}

function confidenceColor(conf: number, threshold: number): string {
  if (conf >= threshold + 0.1) return '#67c23a';
  if (conf >= threshold)       return '#e6a23c';
  return '#f56c6c';
}

function fmtAge(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

onMounted(loadAll);
</script>

<style scoped>
.classroom-ops { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.stats-bar { margin-bottom: 20px; }
.stat-card { text-align: center; }
.stat-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.stat-value { font-size: 28px; font-weight: 700; }
.stat-online .stat-value  { color: #67c23a; }
.stat-offline .stat-value { color: #f56c6c; }
.stat-anomaly .stat-value { color: #e6a23c; }
.filters { margin-bottom: 20px; }
.filters .el-select { width: 100%; }
.classroom-grid { margin-bottom: 20px; }
.classroom-card {
  cursor: pointer;
  margin-bottom: 16px;
  transition: transform 0.15s;
}
.classroom-card:hover { transform: translateY(-2px); }
.card-online  { border-top: 3px solid #67c23a; }
.card-offline { border-top: 3px solid #f56c6c; background: #fff5f5; }
.card-degraded { border-top: 3px solid #e6a23c; background: #fffbf0; }
.card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.anomaly-badge { cursor: pointer; }
.card-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-meta { font-size: 13px; color: #606266; margin-bottom: 4px; }
.card-node { margin-bottom: 8px; }
.confidence-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.card-footer { margin-top: 10px; }
.pagination { margin-top: 16px; justify-content: center; }
.socket-status { position: fixed; bottom: 16px; right: 16px; }
.loading-state, .empty-state { padding: 40px; text-align: center; }
</style>
