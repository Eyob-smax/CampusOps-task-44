<template>
  <div class="page-audit">
    <div class="page-header">
      <h2>Audit Log</h2>
      <el-tag type="info" size="small">Read-only — all entries are encrypted at rest</el-tag>
    </div>

    <!-- Search filters -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filters" inline>
        <el-form-item label="Action">
          <el-input v-model="filters.action" placeholder="e.g. auth:login" clearable style="width:180px" />
        </el-form-item>
        <el-form-item label="Entity Type">
          <el-select v-model="filters.entityType" clearable style="width:160px">
            <el-option label="user"             value="user" />
            <el-option label="fulfillment"      value="fulfillment_request" />
            <el-option label="shipment"         value="shipment" />
            <el-option label="after_sales"      value="after_sales_ticket" />
            <el-option label="compensation"     value="compensation" />
            <el-option label="stored_value"     value="stored_value" />
            <el-option label="system_settings"  value="system_settings" />
            <el-option label="integration_key"  value="integration_key" />
          </el-select>
        </el-form-item>
        <el-form-item label="Date Range">
          <el-date-picker v-model="filters.dateRange" type="daterange"
            range-separator="–" start-placeholder="From" end-placeholder="To"
            value-format="YYYY-MM-DD" style="width:260px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load(1)">Search</el-button>
          <el-button @click="resetFilters">Reset</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="logs" v-loading="loading" stripe border style="width:100%;margin-top:16px">
      <el-table-column prop="createdAt" label="Timestamp" width="180">
        <template #default="{ row }">{{ fmtDatetime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="actorUsername" label="Actor" width="140" />
      <el-table-column prop="action" label="Action" min-width="200">
        <template #default="{ row }">
          <el-tag :type="actionTagType(row.action)" size="small">{{ row.action }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="entityType" label="Entity" width="160" />
      <el-table-column prop="entityId"   label="Entity ID" width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.entityId }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="ipAddress" label="IP" width="130" />
      <el-table-column label="Detail" width="120" v-if="canReveal">
        <template #default="{ row }">
          <el-button v-if="!row.detail" size="small" @click="openReveal(row)">Reveal</el-button>
          <el-button v-else size="small" type="success" @click="viewDetail(row)">View</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>

    <!-- Reveal Dialog (admin only) -->
    <el-dialog v-model="revealVisible" title="Reveal Audit Detail (PII)" width="480px">
      <el-alert type="warning" show-icon :closable="false"
        title="This action will be logged. Provide a valid justification." style="margin-bottom:16px" />
      <el-form :model="revealForm" label-position="top">
        <el-form-item label="Justification">
          <el-input v-model="revealForm.justification" type="textarea" :rows="3"
            placeholder="Why are you revealing this entry's detail?" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="revealVisible = false">Cancel</el-button>
        <el-button type="warning" :loading="revealing" @click="handleReveal">Reveal</el-button>
      </template>
    </el-dialog>

    <!-- Detail View Dialog -->
    <el-dialog v-model="detailVisible" title="Audit Entry Detail" width="600px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="Action">{{ viewingEntry?.action }}</el-descriptions-item>
        <el-descriptions-item label="Actor">{{ viewingEntry?.actorUsername }}</el-descriptions-item>
        <el-descriptions-item label="Timestamp">{{ fmtDatetime(viewingEntry?.createdAt ?? '') }}</el-descriptions-item>
        <el-descriptions-item label="IP Address">{{ viewingEntry?.ipAddress ?? '—' }}</el-descriptions-item>
      </el-descriptions>
      <pre v-if="viewingEntry?.detail" class="detail-json">{{ JSON.stringify(viewingEntry.detail, null, 2) }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { auditApi, type AuditLogEntry } from '@/api/admin';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canReveal = computed(() => auth.can('audit:reveal-pii'));

const loading  = ref(false);
const revealing = ref(false);
const logs      = ref<AuditLogEntry[]>([]);
const total     = ref(0);
const currentPage = ref(1);
const pageSize    = 25;

const filters = reactive({
  action:    '',
  entityType: '',
  dateRange: null as [string, string] | null,
});

const revealVisible  = ref(false);
const detailVisible  = ref(false);
const revealForm     = reactive({ justification: '' });
const revealingEntry = ref<AuditLogEntry | null>(null);
const viewingEntry   = ref<AuditLogEntry | null>(null);

async function load(page = 1) {
  loading.value = true;
  currentPage.value = page;
  try {
    const params = {
      page,
      limit: pageSize,
      ...(filters.action     && { action: filters.action }),
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.dateRange?.[0] && { from: filters.dateRange[0] }),
      ...(filters.dateRange?.[1] && { to:   filters.dateRange[1] }),
    };
    const res = await auditApi.search(params) as unknown as { data: { data: AuditLogEntry[]; total: number } };
    logs.value  = res.data.data;
    total.value = res.data.total;
  } catch { ElMessage.error('Failed to load audit logs'); }
  finally  { loading.value = false; }
}

function resetFilters() {
  Object.assign(filters, { action: '', entityType: '', dateRange: null });
  load(1);
}

function openReveal(entry: AuditLogEntry) {
  revealingEntry.value = entry;
  revealForm.justification = '';
  revealVisible.value = true;
}

function viewDetail(entry: AuditLogEntry) {
  viewingEntry.value = entry;
  detailVisible.value = true;
}

async function handleReveal() {
  if (!revealingEntry.value) return;
  revealing.value = true;
  try {
    const res = await auditApi.reveal(revealingEntry.value.id, revealForm.justification) as unknown as { data: AuditLogEntry };
    // Update the entry in the table
    const idx = logs.value.findIndex((l) => l.id === revealingEntry.value!.id);
    if (idx !== -1) logs.value[idx] = res.data;
    revealVisible.value = false;
    viewingEntry.value = res.data;
    detailVisible.value = true;
  } catch (e: unknown) {
    ElMessage.error((e as { error?: string })?.error ?? 'Reveal failed');
  } finally { revealing.value = false; }
}

function fmtDatetime(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function actionTagType(action: string): 'danger' | 'warning' | 'success' | 'info' | '' {
  if (action.includes('failed') || action.includes('error')) return 'danger';
  if (action.includes('delete') || action.includes('deactivate')) return 'warning';
  if (action.includes('login') && action.includes('success')) return 'success';
  return '';
}

onMounted(() => load(1));
</script>

<style scoped>
.page-audit { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 22px; }
.filter-card { margin-bottom: 0; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.mono { font-family: monospace; font-size: 12px; color: #606266; }
.detail-json { background: #f5f7fa; padding: 12px; border-radius: 4px; font-size: 13px; overflow: auto; max-height: 400px; margin-top: 16px; }
</style>
