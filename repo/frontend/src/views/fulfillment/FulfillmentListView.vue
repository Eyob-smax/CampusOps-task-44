<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Fulfillment Requests</h2>
      <el-button type="primary" @click="$router.push('/fulfillment/new')">New Request</el-button>
    </div>

    <div class="filters">
      <el-select v-model="filterStatus" placeholder="All statuses" clearable style="width:160px;" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="capitalize(s)" :value="s" />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="requests" stripe @row-click="(r: any) => $router.push(`/fulfillment/${r.id}`)">
      <el-table-column label="Receipt #" prop="receiptNumber" width="170" />
      <el-table-column label="Student" min-width="180">
        <template #default="{ row }">
          {{ row.student?.fullName ?? row.studentId }}
        </template>
      </el-table-column>
      <el-table-column label="Status" width="130">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ capitalize(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Total" width="110">
        <template #default="{ row }">${{ Number(row.totalAmount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="Points" width="90" prop="pointsEarned" />
      <el-table-column label="Created" width="160">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        v-model:current-page="page"
        :page-size="limit"
        :total="total"
        layout="prev, pager, next, total"
        @current-change="load"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { fulfillmentApi, type FulfillmentRequest, type FulfillmentStatus } from '../../api/fulfillment';

const requests = ref<FulfillmentRequest[]>([]);
const loading  = ref(false);
const total    = ref(0);
const page     = ref(1);
const limit    = 20;
const filterStatus = ref('');

const statusOptions: FulfillmentStatus[] = ['draft', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];

async function load() {
  loading.value = true;
  try {
    const res = await fulfillmentApi.list({
      status: filterStatus.value || undefined,
      page: page.value,
      limit,
    });
    requests.value = res.data.data.items;
    total.value    = res.data.data.total;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    draft: 'info', pending: '', processing: 'warning',
    shipped: 'warning', delivered: 'success', cancelled: 'danger',
  };
  return map[s] ?? 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.filters { margin-bottom: 16px; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
