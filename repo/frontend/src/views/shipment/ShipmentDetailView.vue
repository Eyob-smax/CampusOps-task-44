<template>
  <div class="view-page">
    <div class="page-header">
      <el-button plain @click="$router.push('/shipments')">← Back</el-button>
      <h2>Shipment Detail</h2>
      <div v-if="shipment" class="header-actions">
        <el-tag :type="statusTagType(shipment.status)" size="large">{{ formatStatus(shipment.status) }}</el-tag>
        <el-button size="small" @click="triggerSync" :loading="syncing">Trigger Sync</el-button>
      </div>
    </div>

    <div v-if="loading" v-loading="true" style="height:200px;" />

    <template v-else-if="shipment">
      <el-row :gutter="24">
        <el-col :span="12">
          <el-card header="Shipment Info">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="Status">
                <el-tag :type="statusTagType(shipment.status)">{{ formatStatus(shipment.status) }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="Carrier">{{ shipment.carrier?.name ?? shipment.carrierId }}</el-descriptions-item>
              <el-descriptions-item label="Warehouse">{{ shipment.warehouse?.name ?? shipment.warehouseId }}</el-descriptions-item>
              <el-descriptions-item label="Est. Delivery">
                {{ shipment.estimatedDeliveryAt ? new Date(shipment.estimatedDeliveryAt).toLocaleDateString() : '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="Delivered At">
                {{ shipment.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString() : '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="Last Sync">
                {{ shipment.lastSyncAt ? new Date(shipment.lastSyncAt).toLocaleString() : 'Never' }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :span="12">
          <el-card header="Update Status">
            <div class="status-actions">
              <el-select v-model="newStatus" placeholder="Select status" style="width:200px;">
                <el-option v-for="s in statusOptions" :key="s" :label="formatStatus(s)" :value="s" />
              </el-select>
              <el-button type="primary" :disabled="!newStatus || newStatus === shipment.status"
                :loading="updatingStatus" @click="updateStatus">
                Update
              </el-button>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- Parcels -->
      <el-card header="Parcels" style="margin-top: 20px;">
        <template #header>
          <div class="card-header">
            <span>Parcels</span>
            <el-button size="small" type="primary" @click="openAddParcel">+ Add Parcel</el-button>
          </div>
        </template>
        <el-table :data="shipment.parcels ?? []" stripe size="small">
          <el-table-column label="Tracking #" prop="trackingNumber" min-width="180" />
          <el-table-column label="Status" width="160">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ formatStatus(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Weight (lb)" width="120">
            <template #default="{ row }">{{ row.weightLb ?? '—' }}</template>
          </el-table-column>
          <el-table-column label="Description" prop="description" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ row.description ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <!-- Add parcel dialog -->
    <el-dialog v-model="parcelDialog.visible" title="Add Parcel" width="420px">
      <el-form :model="parcelForm" label-width="140px">
        <el-form-item label="Tracking Number" required>
          <el-input v-model="parcelForm.trackingNumber" />
        </el-form-item>
        <el-form-item label="Weight (lb)">
          <el-input-number v-model="parcelForm.weightLb" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="parcelForm.description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="parcelDialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="addingParcel"
          :disabled="!parcelForm.trackingNumber" @click="submitParcel">Add</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { shipmentApi, parcelApi, type Shipment, type ShipmentStatus } from '../../api/shipment';

const route  = useRoute();
const shipment      = ref<Shipment | null>(null);
const loading       = ref(false);
const syncing       = ref(false);
const updatingStatus = ref(false);
const addingParcel  = ref(false);
const newStatus     = ref<ShipmentStatus | ''>('');

const statusOptions: ShipmentStatus[] = ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'];
const parcelDialog  = ref({ visible: false });
const parcelForm    = ref({ trackingNumber: '', weightLb: 0, description: '' });

async function load() {
  loading.value = true;
  try {
    const res = await shipmentApi.getById(route.params.id as string);
    shipment.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function updateStatus() {
  if (!shipment.value || !newStatus.value) return;
  updatingStatus.value = true;
  try {
    const res = await shipmentApi.updateStatus(shipment.value.id, newStatus.value as ShipmentStatus);
    shipment.value = res.data.data;
    ElMessage.success('Status updated');
    newStatus.value = '';
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Update failed');
  } finally {
    updatingStatus.value = false;
  }
}

async function triggerSync() {
  if (!shipment.value) return;
  syncing.value = true;
  try {
    await shipmentApi.triggerSync(shipment.value.carrierId);
    ElMessage.success('Sync job queued');
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to trigger sync');
  } finally {
    syncing.value = false;
  }
}

function openAddParcel() {
  parcelForm.value = { trackingNumber: '', weightLb: 0, description: '' };
  parcelDialog.value.visible = true;
}

async function submitParcel() {
  if (!shipment.value) return;
  addingParcel.value = true;
  try {
    await parcelApi.add({
      shipmentId: shipment.value.id,
      trackingNumber: parcelForm.value.trackingNumber,
      ...(parcelForm.value.weightLb ? { weightLb: parcelForm.value.weightLb } : {}),
      ...(parcelForm.value.description ? { description: parcelForm.value.description } : {}),
    });
    ElMessage.success('Parcel added');
    parcelDialog.value.visible = false;
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to add parcel');
  } finally {
    addingParcel.value = false;
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
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.page-header h2 { margin: 0; flex: 1; }
.header-actions { display: flex; align-items: center; gap: 8px; }
.status-actions { display: flex; gap: 10px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
</style>
