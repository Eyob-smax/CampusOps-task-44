<template>
  <div class="view-page">
    <div class="page-header">
      <h2>After-Sales Tickets</h2>
      <el-button type="primary" @click="$router.push('/after-sales/new')">New Ticket</el-button>
    </div>

    <div class="filters">
      <el-select v-model="filterType" placeholder="All types" clearable style="width:140px;" @change="load">
        <el-option label="Delay" value="delay" />
        <el-option label="Dispute" value="dispute" />
        <el-option label="Lost Item" value="lost_item" />
      </el-select>
      <el-select v-model="filterStatus" placeholder="All statuses" clearable style="width:160px;" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="formatStatus(s)" :value="s" />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="tickets" stripe
      @row-click="(r: any) => $router.push(`/after-sales/${r.id}`)">
      <el-table-column label="Type" width="120">
        <template #default="{ row }">
          <el-tag :type="typeTagType(row.type)" size="small">{{ formatType(row.type) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Status" width="140">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ formatStatus(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Student" min-width="180">
        <template #default="{ row }">{{ row.student?.fullName ?? row.studentId }}</template>
      </el-table-column>
      <el-table-column label="Description" min-width="240" prop="description" show-overflow-tooltip />
      <el-table-column label="SLA" width="130">
        <template #default="{ row }">
          <el-tag :type="slaTagType(row.slaStatus)" size="small">{{ row.slaStatus ?? '—' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Created" width="160">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleDateString() }}</template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination v-model:current-page="page" :page-size="limit" :total="total"
        layout="prev, pager, next, total" @current-change="load" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { afterSalesApi, type AfterSalesTicket, type TicketStatus } from '../../api/after-sales';

const tickets      = ref<AfterSalesTicket[]>([]);
const loading      = ref(false);
const total        = ref(0);
const page         = ref(1);
const limit        = 20;
const filterType   = ref('');
const filterStatus = ref('');

const statusOptions: TicketStatus[] = ['open', 'under_review', 'pending_approval', 'resolved', 'closed'];

async function load() {
  loading.value = true;
  try {
    const res = await afterSalesApi.list({
      type: filterType.value || undefined,
      status: filterStatus.value || undefined,
      page: page.value, limit,
    });
    tickets.value = res.data.data.items;
    total.value   = res.data.data.total;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function formatType(t: string) {
  return t === 'lost_item' ? 'Lost Item' : t.charAt(0).toUpperCase() + t.slice(1);
}
function formatStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function typeTagType(t: string): '' | 'warning' | 'danger' | 'info' {
  return t === 'delay' ? '' : t === 'dispute' ? 'warning' : 'danger';
}
function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const m: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    open: 'warning', under_review: '', pending_approval: 'warning', resolved: 'success', closed: 'info',
  };
  return m[s] ?? 'info';
}
function slaTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const m: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    within_sla: 'success', at_risk: 'warning', breached: 'danger', closed: 'info',
  };
  return m[s] ?? 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.filters { display: flex; gap: 12px; margin-bottom: 16px; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
