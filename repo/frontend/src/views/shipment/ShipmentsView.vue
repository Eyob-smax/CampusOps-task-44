<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Shipments</h2>
      <el-button type="primary" @click="openCreate">New Shipment</el-button>
    </div>

    <div class="filters">
      <el-select v-model="filterStatus" placeholder="All statuses" clearable style="width:180px;" @change="load">
        <el-option v-for="s in statusOptions" :key="s" :label="formatStatus(s)" :value="s" />
      </el-select>
      <el-button plain @click="load" :loading="loading">Refresh</el-button>
    </div>

    <el-table v-loading="loading" :data="shipments" stripe @row-click="(r:any) => $router.push(`/shipments/${r.id}`)">
      <el-table-column label="Status" width="160">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ formatStatus(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Carrier" width="140">
        <template #default="{ row }">{{ row.carrier?.name ?? row.carrierId }}</template>
      </el-table-column>
      <el-table-column label="Warehouse" width="160">
        <template #default="{ row }">{{ row.warehouse?.name ?? row.warehouseId }}</template>
      </el-table-column>
      <el-table-column label="Est. Delivery" width="160">
        <template #default="{ row }">
          {{ row.estimatedDeliveryAt ? new Date(row.estimatedDeliveryAt).toLocaleDateString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="Last Sync" width="160">
        <template #default="{ row }">
          {{ row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString() : 'Never' }}
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

    <!-- Create dialog -->
    <el-dialog v-model="createDialog.visible" title="New Shipment" width="480px">
      <el-form :model="createForm" label-width="160px">
        <el-form-item label="Fulfillment Request ID" required>
          <el-input v-model="createForm.fulfillmentRequestId" placeholder="UUID" />
        </el-form-item>
        <el-form-item label="Warehouse" required>
          <el-select v-model="createForm.warehouseId" style="width:100%;">
            <el-option v-for="w in warehouses" :key="w.id" :label="w.name" :value="w.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Carrier" required>
          <el-select v-model="createForm.carrierId" style="width:100%;">
            <el-option v-for="c in carriers" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Est. Delivery">
          <el-date-picker v-model="createForm.estimatedDeliveryAt" type="datetime" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting"
          :disabled="!createForm.fulfillmentRequestId || !createForm.warehouseId || !createForm.carrierId"
          @click="submitCreate">Create</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { shipmentApi, type Shipment, type ShipmentStatus } from '../../api/shipment';
import { warehouseApi, type Warehouse } from '../../api/logistics';
import { carrierApi, type Carrier } from '../../api/logistics';

const shipments  = ref<Shipment[]>([]);
const warehouses = ref<Warehouse[]>([]);
const carriers   = ref<Carrier[]>([]);
const loading    = ref(false);
const submitting = ref(false);
const total      = ref(0);
const page       = ref(1);
const limit      = 20;
const filterStatus = ref('');

const statusOptions: ShipmentStatus[] = ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'];

const createDialog = ref({ visible: false });
const createForm = ref({
  fulfillmentRequestId: '', warehouseId: '', carrierId: '',
  estimatedDeliveryAt: null as string | null,
});

async function load() {
  loading.value = true;
  try {
    const res = await shipmentApi.list({ status: filterStatus.value || undefined, page: page.value, limit });
    shipments.value = res.data.data.items;
    total.value     = res.data.data.total;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await Promise.all([
    load(),
    warehouseApi.list().then((r) => { warehouses.value = r.data.data; }),
    carrierApi.list().then((r) => { carriers.value = r.data.data; }),
  ]);
});

function openCreate() {
  createForm.value = { fulfillmentRequestId: '', warehouseId: '', carrierId: '', estimatedDeliveryAt: null };
  createDialog.value.visible = true;
}

async function submitCreate() {
  submitting.value = true;
  try {
    await shipmentApi.create({
      fulfillmentRequestId: createForm.value.fulfillmentRequestId,
      warehouseId: createForm.value.warehouseId,
      carrierId: createForm.value.carrierId,
      estimatedDeliveryAt: createForm.value.estimatedDeliveryAt ?? undefined,
    });
    ElMessage.success('Shipment created');
    createDialog.value.visible = false;
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to create shipment');
  } finally {
    submitting.value = false;
  }
}

function formatStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    pending: 'info', in_transit: '', out_for_delivery: 'warning',
    delivered: 'success', exception: 'danger', returned: 'info',
  };
  return map[s] ?? 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.filters { display: flex; gap: 12px; margin-bottom: 16px; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>
