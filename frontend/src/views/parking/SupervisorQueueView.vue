<template>
  <div class="sv-queue">
    <div class="sv-header">
      <h2>Supervisor Queue — Escalated Alerts</h2>
      <el-tag v-if="connected" type="success" size="small">Live</el-tag>
      <el-tag v-else type="danger" size="small">Disconnected</el-tag>
    </div>

    <el-alert
      v-if="newEscalations.length"
      type="error"
      :title="`${newEscalations.length} new escalation(s) since you last viewed`"
      show-icon
      closable
      @close="newEscalations = []"
      style="margin-bottom: 16px;"
    />

    <el-table
      v-loading="loading"
      :data="alerts"
      row-key="id"
      stripe
      @row-click="openDetail"
    >
      <el-table-column label="Lot" prop="lot.name" width="140" />
      <el-table-column label="Type" width="200">
        <template #default="{ row }">
          <el-tag size="small" type="warning">{{ formatType(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Description" min-width="260" prop="description" show-overflow-tooltip />
      <el-table-column label="Escalated" width="160">
        <template #default="{ row }">
          {{ row.escalatedAt ? formatTime(row.escalatedAt) : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="Age" width="100">
        <template #default="{ row }">{{ formatAge(row.ageSeconds) }}</template>
      </el-table-column>
      <el-table-column label="Actions" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click.stop="doClaim(row)" :disabled="row.status === 'claimed'">
            Claim
          </el-button>
          <el-button size="small" type="success" @click.stop="openClose(row)">Close</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="sv-pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="loadAlerts"
      />
    </div>

    <!-- Close dialog -->
    <el-dialog v-model="closeDialog.visible" title="Close Alert" width="420px" @close="closeDialog.note = ''">
      <el-form>
        <el-form-item label="Closure Note">
          <el-input
            v-model="closeDialog.note"
            type="textarea"
            :rows="3"
            placeholder="Describe what action was taken (min 5 chars)"
          />
          <div v-if="closeDialog.note.trim().length > 0 && closeDialog.note.trim().length < 5" class="note-error">
            At least 5 characters required.
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog.visible = false">Cancel</el-button>
        <el-button
          type="primary"
          :disabled="closeDialog.note.trim().length < 5"
          :loading="closeDialog.submitting"
          @click="submitClose"
        >
          Close Alert
        </el-button>
      </template>
    </el-dialog>

    <!-- Detail drawer -->
    <el-drawer v-model="drawer.visible" :title="drawer.alert?.type ? formatType(drawer.alert.type) : 'Alert Detail'" size="480px">
      <template v-if="drawer.alert">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="Lot">{{ drawer.alert.lot?.name }}</el-descriptions-item>
          <el-descriptions-item label="Status">
            <el-tag :type="statusTagType(drawer.alert.status)">{{ drawer.alert.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="Description">{{ drawer.alert.description }}</el-descriptions-item>
          <el-descriptions-item label="Escalated At">{{ drawer.alert.escalatedAt ? formatTime(drawer.alert.escalatedAt) : '—' }}</el-descriptions-item>
          <el-descriptions-item label="Claimed By">{{ drawer.alert.claimedBy?.username ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="SLA Deadline">{{ drawer.alert.slaDeadlineAt ? formatTime(drawer.alert.slaDeadlineAt) : '—' }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin: 20px 0 8px;">Timeline</h4>
        <el-timeline>
          <el-timeline-item
            v-for="entry in drawer.alert.timeline"
            :key="entry.id"
            :timestamp="formatTime(entry.createdAt)"
          >
            <strong>{{ entry.action }}</strong>
            <div v-if="entry.note" class="tl-note">{{ entry.note }}</div>
          </el-timeline-item>
        </el-timeline>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { parkingAlertApi, type ParkingAlert } from '../../api/parking';
import { useParkingSocket } from '../../composables/useParkingSocket';

const alerts  = ref<ParkingAlert[]>([]);
const loading = ref(false);
const total   = ref(0);
const page    = ref(1);
const limit   = 25;

const newEscalations = ref<string[]>([]);

const { connected, onAlertCreated, onAlertUpdated } = useParkingSocket();

const closeDialog = ref<{ visible: boolean; alert: ParkingAlert | null; note: string; submitting: boolean }>({
  visible: false, alert: null, note: '', submitting: false,
});
const drawer = ref<{ visible: boolean; alert: ParkingAlert | null }>({ visible: false, alert: null });

let ticker: ReturnType<typeof setInterval> | null = null;

async function loadAlerts() {
  loading.value = true;
  try {
    const res = await parkingAlertApi.list({ status: 'escalated', page: page.value, limit });
    alerts.value = (res.data.data as any[]).map((a) => ({ ...a }));
    total.value  = res.data.total;
  } finally {
    loading.value = false;
  }
}

function patchAlert(evt: { alertId: string; status?: string }) {
  const idx = alerts.value.findIndex((a) => a.id === evt.alertId);
  if (idx !== -1 && evt.status) {
    (alerts.value[idx] as any).status = evt.status;
  }
}

onMounted(() => {
  loadAlerts();
  ticker = setInterval(() => {
    alerts.value.forEach((a) => {
      if (a.msToSlaDeadline != null) {
        (a as any).msToSlaDeadline = Math.max(0, (a.msToSlaDeadline as number) - 1000);
      }
    });
  }, 1000);

  onAlertCreated.value = (evt) => {
    if ((evt as any).status === 'escalated') {
      newEscalations.value.push(evt.alertId);
      loadAlerts();
    }
  };
  onAlertUpdated.value = (evt) => {
    if ((evt as any).status === 'escalated') {
      const exists = alerts.value.some((a) => a.id === evt.alertId);
      if (!exists) { newEscalations.value.push(evt.alertId); loadAlerts(); }
    }
    patchAlert(evt as any);
  };
});

onUnmounted(() => {
  if (ticker) clearInterval(ticker);
});

async function doClaim(alert: ParkingAlert) {
  try {
    await parkingAlertApi.claim(alert.id);
    ElMessage.success('Alert claimed');
    loadAlerts();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to claim');
  }
}

function openClose(alert: ParkingAlert) {
  closeDialog.value = { visible: true, alert, note: '', submitting: false };
}

async function submitClose() {
  if (!closeDialog.value.alert) return;
  closeDialog.value.submitting = true;
  try {
    await parkingAlertApi.close(closeDialog.value.alert.id, closeDialog.value.note);
    ElMessage.success('Alert closed');
    closeDialog.value.visible = false;
    loadAlerts();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to close alert');
  } finally {
    closeDialog.value.submitting = false;
  }
}

function openDetail(row: ParkingAlert) {
  drawer.value = { visible: true, alert: row };
}

function formatType(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}
function formatAge(s: number) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    open: 'warning', claimed: '', closed: 'success', escalated: 'danger',
  };
  return map[s] ?? 'info';
}
</script>

<style scoped>
.sv-queue { padding: 24px; }
.sv-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.sv-header h2 { margin: 0; }
.sv-pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.note-error { color: #f56c6c; font-size: 12px; margin-top: 4px; }
.tl-note { font-size: 13px; color: #606266; margin-top: 2px; }
</style>
