<template>
  <div class="view-page">
    <div class="page-header">
      <el-button plain @click="$router.push('/fulfillment')">← Back</el-button>
      <h2>Fulfillment — {{ req?.receiptNumber }}</h2>
      <el-tag v-if="req" :type="statusTagType(req.status)" size="large">{{ capitalize(req.status) }}</el-tag>
    </div>

    <div v-if="loading" v-loading="true" style="height:200px;" />

    <template v-else-if="req">
      <el-row :gutter="24">
        <!-- Summary card -->
        <el-col :span="12">
          <el-card header="Summary">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="Student">
                {{ req.student?.fullName ?? req.studentId }}
              </el-descriptions-item>
              <el-descriptions-item label="Subtotal">${{ Number(req.subtotal).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="Discount">-${{ Number(req.discountAmount).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="Shipping">${{ Number(req.shippingFee).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="Stored Value Used">-${{ Number(req.storedValueUsed).toFixed(2) }}</el-descriptions-item>
              <el-descriptions-item label="Total">
                <strong>${{ Number(req.totalAmount).toFixed(2) }}</strong>
              </el-descriptions-item>
              <el-descriptions-item label="Points Earned">{{ req.pointsEarned }}</el-descriptions-item>
              <el-descriptions-item v-if="req.coupon" label="Coupon">{{ req.coupon.code }}</el-descriptions-item>
              <el-descriptions-item v-if="req.notes" label="Notes">{{ req.notes }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <!-- Actions card -->
        <el-col :span="12">
          <el-card header="Advance Status">
            <div class="actions-col">
              <template v-if="req.status !== 'cancelled' && req.status !== 'delivered'">
                <el-button
                  v-for="next in allowedTransitions"
                  :key="next"
                  :type="next === 'cancelled' ? 'danger' : 'primary'"
                  :plain="next === 'cancelled'"
                  :loading="transitionLoading === next"
                  @click="doTransition(next)"
                >
                  → {{ capitalize(next) }}
                </el-button>
              </template>
              <el-text v-else type="success">No further actions</el-text>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- Items table -->
      <el-card header="Items" style="margin-top: 20px;">
        <el-table :data="req.items" stripe>
          <el-table-column label="Description" prop="description" min-width="240" />
          <el-table-column label="Qty" prop="quantity" width="80" />
          <el-table-column label="Unit Price" width="120">
            <template #default="{ row }">${{ Number(row.unitPrice).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="Subtotal" width="120">
            <template #default="{ row }">${{ (row.quantity * Number(row.unitPrice)).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="Weight (lb)" width="120">
            <template #default="{ row }">{{ row.weightLb != null ? row.weightLb : '—' }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { fulfillmentApi, type FulfillmentRequest, type FulfillmentStatus } from '../../api/fulfillment';

const route = useRoute();
const req     = ref<FulfillmentRequest | null>(null);
const loading = ref(false);
const transitionLoading = ref<string | null>(null);

const TRANSITIONS: Record<string, FulfillmentStatus[]> = {
  pending:    ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered', 'cancelled'],
  delivered:  [],
  cancelled:  [],
};

const allowedTransitions = computed<FulfillmentStatus[]>(() =>
  req.value ? (TRANSITIONS[req.value.status] ?? []) : [],
);

async function load() {
  loading.value = true;
  try {
    const res = await fulfillmentApi.getById(route.params.id as string);
    req.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function doTransition(status: FulfillmentStatus) {
  transitionLoading.value = status;
  try {
    const res = status === 'cancelled'
      ? await fulfillmentApi.cancel(req.value!.id)
      : await fulfillmentApi.updateStatus(req.value!.id, status);
    req.value = res.data.data;
    ElMessage.success(`Status updated to ${status}`);
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Transition failed');
  } finally {
    transitionLoading.value = null;
  }
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    pending: '', processing: 'warning',
    shipped: 'warning', delivered: 'success', cancelled: 'danger',
  };
  return map[s] ?? 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.page-header h2 { margin: 0; }
.actions-col { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
</style>
