<template>
  <div class="anomaly-queue">
    <div class="page-header">
      <h2>Anomaly Queue</h2>
      <el-button :icon="RefreshIcon" :loading="loading" @click="loadAnomalies">Refresh</el-button>
    </div>

    <!-- Filters -->
    <el-row :gutter="12" class="filters">
      <el-col :span="5">
        <el-select v-model="statusFilter" placeholder="All statuses" clearable @change="onFilterChange">
          <el-option label="Open"         value="open" />
          <el-option label="Acknowledged" value="acknowledged" />
          <el-option label="Assigned"     value="assigned" />
          <el-option label="Resolved"     value="resolved" />
          <el-option label="Escalated"    value="escalated" />
        </el-select>
      </el-col>
      <el-col :span="5">
        <el-input v-model="typeFilter" placeholder="Type filter…" clearable @change="onFilterChange" />
      </el-col>
      <el-col :span="7">
        <el-input v-model="search" placeholder="Search description…" clearable @change="onFilterChange" />
      </el-col>
      <el-col :span="7">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="–"
          start-placeholder="From"
          end-placeholder="To"
          value-format="YYYY-MM-DD"
          style="width: 100%"
          @change="onFilterChange"
        />
      </el-col>
    </el-row>

    <!-- Table -->
    <el-table
      :data="anomalies"
      v-loading="loading"
      row-key="id"
      :row-class-name="rowClass"
      @row-click="openTimeline"
      style="width: 100%; cursor: pointer"
    >
      <el-table-column label="Created" width="160">
        <template #default="{ row }">
          <span>{{ fmtDateShort(row.createdAt) }}</span>
          <div style="font-size:11px;color:#909399">{{ fmtAge(row.createdAt) }}</div>
        </template>
      </el-table-column>

      <el-table-column label="Classroom / Room" min-width="160">
        <template #default="{ row }">
          <div>{{ row.classroom?.class?.name ?? '—' }}</div>
          <div style="font-size:11px;color:#909399">
            {{ row.classroom?.class?.roomNumber ? `Room ${row.classroom.class.roomNumber}` : '' }}
            <span v-if="row.classroom?.class?.department"> · {{ row.classroom.class.department.code }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="Type" width="140">
        <template #default="{ row }">
          <el-tag size="small" effect="plain">{{ row.type }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Description" min-width="200">
        <template #default="{ row }">
          <span class="description-cell">{{ row.description }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Status" width="130">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small" effect="dark">
            {{ row.status.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="Assigned To" width="130">
        <template #default="{ row }">
          <span>{{ row.assignedTo?.username ?? '—' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Actions" width="240" @click.stop>
        <template #default="{ row }">
          <div class="action-buttons" @click.stop>
            <el-button
              v-if="row.status === 'open'"
              size="small" type="primary"
              :loading="actionLoading[row.id]"
              @click.stop="handleAcknowledge(row)"
            >Acknowledge</el-button>

            <el-button
              v-if="row.status === 'acknowledged'"
              size="small" type="warning"
              :loading="actionLoading[row.id]"
              @click.stop="openAssignDialog(row)"
            >Assign</el-button>

            <el-button
              v-if="row.status === 'assigned'"
              size="small" type="success"
              :loading="actionLoading[row.id]"
              @click.stop="openResolveDialog(row)"
            >Resolve</el-button>

            <el-button
              v-if="['open','acknowledged','assigned'].includes(row.status)"
              size="small" type="danger" plain
              :loading="actionLoading[row.id]"
              @click.stop="handleEscalate(row)"
            >Escalate</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="total > limit"
      v-model:current-page="page"
      :page-size="limit"
      :total="total"
      layout="prev, pager, next, total"
      class="pagination"
      @current-change="loadAnomalies"
    />

    <!-- Timeline drawer -->
    <el-drawer
      v-model="timelineOpen"
      title="Anomaly Timeline"
      size="480px"
      direction="rtl"
    >
      <template v-if="selectedAnomaly">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="Type">{{ selectedAnomaly.type }}</el-descriptions-item>
          <el-descriptions-item label="Status">
            <el-tag :type="statusTagType(selectedAnomaly.status)" size="small" effect="dark">
              {{ selectedAnomaly.status.toUpperCase() }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Classroom">
            {{ selectedAnomaly.classroom?.class?.name ?? '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="Description">{{ selectedAnomaly.description }}</el-descriptions-item>
          <el-descriptions-item v-if="selectedAnomaly.resolutionNote" label="Resolution Note">
            {{ selectedAnomaly.resolutionNote }}
          </el-descriptions-item>
        </el-descriptions>

        <h4 style="margin: 20px 0 12px">Timeline</h4>
        <el-timeline v-if="selectedAnomaly.timeline?.length">
          <el-timeline-item
            v-for="entry in selectedAnomaly.timeline"
            :key="entry.id"
            :timestamp="fmtDate(entry.createdAt)"
            placement="top"
          >
            <el-card shadow="never" class="timeline-card">
              <strong>{{ entry.action }}</strong>
              <p v-if="entry.note" class="timeline-note">{{ entry.note }}</p>
              <div style="font-size:11px;color:#909399">{{ entry.actorId ? `by ${entry.actorId}` : 'System' }}</div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
        <el-empty v-else description="No timeline events" />
      </template>
    </el-drawer>

    <!-- Assign dialog -->
    <el-dialog v-model="assignDialogOpen" title="Assign Anomaly" width="400px">
      <el-form label-position="top">
        <el-form-item label="Assign to user">
          <el-select v-model="assignUserId" placeholder="Select user…" style="width: 100%">
            <el-option v-for="u in users" :key="u.id" :label="u.username" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Note (optional)">
          <el-input v-model="assignNote" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialogOpen = false">Cancel</el-button>
        <el-button type="primary" :loading="dialogLoading" :disabled="!assignUserId" @click="confirmAssign">Assign</el-button>
      </template>
    </el-dialog>

    <!-- Resolve dialog (required note >= 20 chars) -->
    <el-dialog v-model="resolveDialogOpen" title="Resolve Anomaly" width="480px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item
          label="Resolution Note"
          :error="resolveNoteError"
          required
        >
          <el-input
            v-model="resolveNote"
            type="textarea"
            :rows="4"
            placeholder="Describe how the anomaly was resolved (min 20 characters)..."
            @input="validateResolveNote"
          />
          <div style="text-align:right;font-size:11px;color:#909399;margin-top:4px">
            {{ resolveNote.length }} / 20 min
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resolveDialogOpen = false">Cancel</el-button>
        <el-button
          type="success"
          :loading="dialogLoading"
          :disabled="resolveNote.length < 20"
          @click="confirmResolve"
        >Resolve</el-button>
      </template>
    </el-dialog>

    <!-- Socket status -->
    <div class="socket-status">
      <el-tag :type="socketConnected ? 'success' : 'warning'" size="small" effect="plain">
        {{ socketConnected ? '⬤ Live' : '○ Reconnecting…' }}
      </el-tag>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh as RefreshIcon } from '@element-plus/icons-vue';
import { anomalyApi } from '../../api/classroom';
import type { Anomaly, AnomalyStatus } from '../../api/classroom';
import { useClassroomSocket } from '../../composables/useClassroomSocket';
import { apiClient } from '../../api/client';

const route = useRoute();

const anomalies = ref<Anomaly[]>([]);
const users     = ref<{ id: string; username: string }[]>([]);
const loading   = ref(false);
const total     = ref(0);
const page      = ref(1);
const limit     = 50;

// Filters
const statusFilter = ref((route.query.status as string) || '');
const typeFilter   = ref('');
const search       = ref('');
const dateRange    = ref<[string, string] | null>(null);

// Per-row action loading
const actionLoading = reactive<Record<string, boolean>>({});

// Timeline drawer
const timelineOpen    = ref(false);
const selectedAnomaly = ref<Anomaly | null>(null);

// Assign dialog
const assignDialogOpen = ref(false);
const assignTarget     = ref<Anomaly | null>(null);
const assignUserId     = ref('');
const assignNote       = ref('');
const dialogLoading    = ref(false);

// Resolve dialog
const resolveDialogOpen = ref(false);
const resolveTarget     = ref<Anomaly | null>(null);
const resolveNote       = ref('');
const resolveNoteError  = ref('');

// Socket.IO real-time
const { connected: socketConnected, onAnomalyCreated, onAnomalyUpdated } = useClassroomSocket();

onAnomalyCreated.value = () => loadAnomalies();

onAnomalyUpdated.value = (evt) => {
  const idx = anomalies.value.findIndex(a => a.id === evt.anomalyId);
  if (idx !== -1) {
    (anomalies.value[idx] as unknown as Record<string, unknown>).status = evt.status;
    if (evt.assignedToId) {
      (anomalies.value[idx] as unknown as Record<string, unknown>).assignedToId = evt.assignedToId;
    }
  }
};

async function loadAnomalies() {
  loading.value = true;
  try {
    const res = await anomalyApi.list({
      classroomId: (route.query.classroomId as string) || undefined,
      status:      statusFilter.value || undefined,
      type:        typeFilter.value || undefined,
      search:      search.value || undefined,
      from:        dateRange.value?.[0] || undefined,
      to:          dateRange.value?.[1] || undefined,
      page:        page.value,
      limit,
    });
    anomalies.value = res.data.data;
    total.value = res.data.total;
  } catch {
    ElMessage.error('Failed to load anomalies');
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  try {
    const res = await apiClient.get<{ data: { id: string; username: string; role: string }[] }>('/api/admin/users');
    users.value = (res.data.data ?? []).filter(
      (u: { id: string; username: string; role: string }) =>
        ['administrator', 'classroom_supervisor'].includes(u.role)
    );
  } catch { /* silently ignore */ }
}

function onFilterChange() {
  page.value = 1;
  loadAnomalies();
}

function openTimeline(row: Anomaly) {
  selectedAnomaly.value = row;
  timelineOpen.value = true;
}

function rowClass({ row }: { row: Anomaly }) {
  if (row.status === 'open')      return 'row-open';
  if (row.status === 'escalated') return 'row-escalated';
  return '';
}

async function handleAcknowledge(row: Anomaly) {
  actionLoading[row.id] = true;
  try {
    const res = await anomalyApi.acknowledge(row.id);
    const idx = anomalies.value.findIndex(a => a.id === row.id);
    if (idx !== -1) anomalies.value[idx] = res.data.data;
    ElMessage.success('Anomaly acknowledged');
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to acknowledge');
  } finally {
    actionLoading[row.id] = false;
  }
}

function openAssignDialog(row: Anomaly) {
  assignTarget.value = row;
  assignUserId.value = '';
  assignNote.value = '';
  assignDialogOpen.value = true;
  loadUsers();
}

async function confirmAssign() {
  if (!assignTarget.value || !assignUserId.value) return;
  dialogLoading.value = true;
  try {
    const res = await anomalyApi.assign(assignTarget.value.id, {
      assignedToId: assignUserId.value,
      note:         assignNote.value || undefined,
    });
    const idx = anomalies.value.findIndex(a => a.id === assignTarget.value!.id);
    if (idx !== -1) anomalies.value[idx] = res.data.data;
    assignDialogOpen.value = false;
    ElMessage.success('Anomaly assigned');
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to assign');
  } finally {
    dialogLoading.value = false;
  }
}

function openResolveDialog(row: Anomaly) {
  resolveTarget.value = row;
  resolveNote.value = '';
  resolveNoteError.value = '';
  resolveDialogOpen.value = true;
}

function validateResolveNote() {
  resolveNoteError.value =
    resolveNote.value.length > 0 && resolveNote.value.length < 20
      ? `${20 - resolveNote.value.length} more character(s) required`
      : '';
}

async function confirmResolve() {
  if (!resolveTarget.value) return;
  if (resolveNote.value.length < 20) {
    resolveNoteError.value = 'Resolution note must be at least 20 characters';
    return;
  }
  dialogLoading.value = true;
  try {
    const res = await anomalyApi.resolve(resolveTarget.value.id, { resolutionNote: resolveNote.value });
    const idx = anomalies.value.findIndex(a => a.id === resolveTarget.value!.id);
    if (idx !== -1) anomalies.value[idx] = res.data.data;
    resolveDialogOpen.value = false;
    ElMessage.success('Anomaly resolved');
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to resolve');
  } finally {
    dialogLoading.value = false;
  }
}

async function handleEscalate(row: Anomaly) {
  try {
    await ElMessageBox.confirm(
      'Escalate this anomaly to the supervisor queue?',
      'Escalate Anomaly',
      { type: 'warning', confirmButtonText: 'Escalate', cancelButtonText: 'Cancel' }
    );
  } catch {
    return;
  }
  actionLoading[row.id] = true;
  try {
    const res = await anomalyApi.escalate(row.id);
    const idx = anomalies.value.findIndex(a => a.id === row.id);
    if (idx !== -1) anomalies.value[idx] = res.data.data;
    ElMessage.warning('Anomaly escalated to supervisor queue');
  } catch (err: unknown) {
    ElMessage.error((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to escalate');
  } finally {
    actionLoading[row.id] = false;
  }
}

function statusTagType(status: AnomalyStatus): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<AnomalyStatus, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    open:         'danger',
    acknowledged: 'warning',
    assigned:     '',
    resolved:     'success',
    escalated:    'danger',
  };
  return map[status] ?? '';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function fmtAge(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

onMounted(loadAnomalies);
</script>

<style scoped>
.anomaly-queue { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.filters { margin-bottom: 20px; }
.filters .el-select,
.filters .el-input { width: 100%; }
.description-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.action-buttons { display: flex; gap: 4px; flex-wrap: wrap; }
.pagination { margin-top: 16px; justify-content: center; }
.timeline-card { margin: 0; }
.timeline-note { margin: 4px 0 0; font-size: 13px; color: #606266; }
.socket-status { position: fixed; bottom: 16px; right: 16px; }

:deep(.row-open td) { background-color: #fff5f5 !important; }
:deep(.row-escalated td) { background-color: #fff0f0 !important; font-weight: 500; }
</style>
