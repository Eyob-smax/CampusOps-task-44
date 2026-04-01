<template>
  <div class="view-page">
    <div class="page-header">
      <el-button plain @click="$router.push('/fulfillment')">← Back</el-button>
      <h2>New Fulfillment Request</h2>
    </div>

    <el-form :model="form" label-width="160px" style="max-width:700px;">
      <!-- Student -->
      <el-form-item label="Student ID" required>
        <el-input v-model="form.studentId" placeholder="Student UUID" />
      </el-form-item>

      <!-- Items -->
      <el-form-item label="Items">
        <div class="items-section">
          <div v-for="(item, i) in form.items" :key="i" class="item-row">
            <el-input v-model="item.description" placeholder="Description" style="width:200px;" />
            <el-input-number v-model="item.quantity" :min="1" :precision="0" style="width:100px;" />
            <el-input-number v-model="item.unitPrice" :min="0" :precision="2" placeholder="Unit price" style="width:130px;" />
            <el-input-number v-model="item.weightLb" :min="0" :precision="2" placeholder="Weight lb" style="width:120px;" />
            <el-button type="danger" plain size="small" @click="removeItem(i)">Del</el-button>
          </div>
          <el-button size="small" @click="addItem">+ Add Item</el-button>
        </div>
      </el-form-item>

      <!-- Coupon -->
      <el-form-item label="Coupon Code">
        <el-input v-model="form.couponCode" placeholder="Optional coupon code" style="width:200px;" />
      </el-form-item>

      <!-- Stored value -->
      <el-form-item label="Use Stored Value ($)">
        <el-input-number v-model="form.storedValueAmount" :min="0" :precision="2" style="width:160px;" />
      </el-form-item>

      <!-- Shipping -->
      <el-form-item label="Zone">
        <el-select v-model="form.zoneId" clearable placeholder="Select zone" style="width:200px;" @change="form.tier = ''">
          <el-option v-for="z in zones" :key="z.id" :label="z.name" :value="z.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="Shipping Tier">
        <el-input v-model="form.tier" placeholder="e.g. standard, express" style="width:200px;" />
      </el-form-item>

      <!-- Notes -->
      <el-form-item label="Notes">
        <el-input v-model="form.notes" type="textarea" :rows="2" />
      </el-form-item>

      <!-- Subtotal preview -->
      <el-form-item label="Subtotal (preview)">
        <span class="preview-amount">${{ subtotal.toFixed(2) }}</span>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="submitting" :disabled="!form.studentId || form.items.length === 0" @click="submit">
          Submit Request
        </el-button>
      </el-form-item>
    </el-form>

    <!-- Result summary -->
    <el-alert
      v-if="result"
      type="success"
      :title="`Request created — Receipt: ${result.receiptNumber}`"
      show-icon
      style="margin-top: 16px; max-width:700px;"
    >
      <div>Total: ${{ Number(result.totalAmount).toFixed(2) }} | Discount: ${{ Number(result.discountAmount).toFixed(2) }} | Points: {{ result.pointsEarned }}</div>
      <div><el-button link type="primary" @click="$router.push(`/fulfillment/${result.id}`)">View Detail →</el-button></div>
    </el-alert>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { fulfillmentApi, type FulfillmentRequest } from '../../api/fulfillment';
import { deliveryZoneApi, type DeliveryZone } from '../../api/logistics';

const zones      = ref<DeliveryZone[]>([]);
const submitting = ref(false);
const result     = ref<FulfillmentRequest | null>(null);

const form = ref({
  studentId: '',
  items: [{ description: '', quantity: 1, unitPrice: 0, weightLb: 0 }],
  couponCode: '',
  storedValueAmount: 0,
  zoneId: '',
  tier: '',
  notes: '',
});

onMounted(async () => {
  const res = await deliveryZoneApi.list();
  zones.value = res.data.data.filter((z) => z.isActive);
});

const subtotal = computed(() =>
  form.value.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
);

function addItem() {
  form.value.items.push({ description: '', quantity: 1, unitPrice: 0, weightLb: 0 });
}
function removeItem(i: number) {
  form.value.items.splice(i, 1);
}

async function submit() {
  if (form.value.items.some((i) => !i.description)) {
    ElMessage.warning('All items must have a description');
    return;
  }
  submitting.value = true;
  try {
    const payload: any = {
      studentId: form.value.studentId,
      items: form.value.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        ...(i.weightLb ? { weightLb: i.weightLb } : {}),
      })),
      ...(form.value.couponCode ? { couponCode: form.value.couponCode } : {}),
      ...(form.value.storedValueAmount ? { storedValueAmount: form.value.storedValueAmount } : {}),
      ...(form.value.zoneId ? { zoneId: form.value.zoneId } : {}),
      ...(form.value.tier ? { tier: form.value.tier } : {}),
      ...(form.value.notes ? { notes: form.value.notes } : {}),
    };
    const res = await fulfillmentApi.create(payload);
    result.value = res.data.data;
    ElMessage.success('Fulfillment request created');
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to create request');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.page-header h2 { margin: 0; }
.items-section { display: flex; flex-direction: column; gap: 8px; }
.item-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.preview-amount { font-size: 18px; font-weight: 600; color: #409eff; }
</style>
