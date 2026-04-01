<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Coupons</h2>
      <el-button type="primary" @click="openCreate">Add Coupon</el-button>
    </div>

    <el-table v-loading="loading" :data="coupons" stripe>
      <el-table-column label="Code" prop="code" width="130" />
      <el-table-column label="Type" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.discountType === 'flat' ? '' : 'warning'">
            {{ row.discountType === 'flat' ? 'Flat' : 'Percent' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Value" width="100">
        <template #default="{ row }">
          {{ row.discountType === 'flat' ? `$${Number(row.discountValue).toFixed(2)}` : `${Number(row.discountValue)}%` }}
        </template>
      </el-table-column>
      <el-table-column label="Min Order" width="110">
        <template #default="{ row }">
          {{ row.minimumOrderValue != null ? `$${Number(row.minimumOrderValue).toFixed(2)}` : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="Usage" width="100">
        <template #default="{ row }">
          {{ row.usageCount }}{{ row.maxUsage != null ? ` / ${row.maxUsage}` : '' }}
        </template>
      </el-table-column>
      <el-table-column label="Expires" width="160">
        <template #default="{ row }">
          {{ row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="Status" width="110">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
            {{ row.isActive ? 'Active' : 'Inactive' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">Edit</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? 'Edit Coupon' : 'Add Coupon'" width="520px">
      <el-form :model="form" label-width="150px">
        <el-form-item label="Code" required>
          <el-input v-model="form.code" placeholder="e.g. SAVE20" style="text-transform:uppercase;" />
        </el-form-item>
        <el-form-item label="Discount Type" required>
          <el-radio-group v-model="form.discountType">
            <el-radio value="flat">Flat ($)</el-radio>
            <el-radio value="percent">Percent (%)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="Discount Value" required>
          <el-input-number v-model="form.discountValue" :min="0.01" :precision="2" />
        </el-form-item>
        <el-form-item label="Min Order ($)">
          <el-input-number v-model="form.minimumOrderValue" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="Max Usage">
          <el-input-number v-model="form.maxUsage" :min="1" :precision="0" />
          <span class="hint">(leave empty for unlimited)</span>
        </el-form-item>
        <el-form-item label="Single Use">
          <el-switch v-model="form.isSingleUse" />
        </el-form-item>
        <el-form-item label="Expires At">
          <el-date-picker v-model="form.expiresAt" type="datetime" placeholder="No expiry" />
        </el-form-item>
        <el-form-item v-if="dialog.isEdit" label="Active">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!form.code || !form.discountValue" @click="submit">
          {{ dialog.isEdit ? 'Save' : 'Create' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { couponApi, type Coupon, type CouponDiscountType } from '../../api/membership';

const coupons    = ref<Coupon[]>([]);
const loading    = ref(false);
const submitting = ref(false);

const dialog = ref<{ visible: boolean; isEdit: boolean; id: string | null }>({
  visible: false, isEdit: false, id: null,
});
const form = ref({
  code: '', discountType: 'flat' as CouponDiscountType,
  discountValue: 0, minimumOrderValue: 0,
  maxUsage: undefined as number | undefined,
  isSingleUse: false, expiresAt: null as string | null, isActive: true,
});

async function load() {
  loading.value = true;
  try {
    const res = await couponApi.list();
    coupons.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  form.value = { code: '', discountType: 'flat', discountValue: 0, minimumOrderValue: 0, maxUsage: undefined, isSingleUse: false, expiresAt: null, isActive: true };
  dialog.value = { visible: true, isEdit: false, id: null };
}
function openEdit(c: Coupon) {
  form.value = {
    code: c.code, discountType: c.discountType, discountValue: Number(c.discountValue),
    minimumOrderValue: c.minimumOrderValue ? Number(c.minimumOrderValue) : 0,
    maxUsage: c.maxUsage ?? undefined, isSingleUse: c.isSingleUse,
    expiresAt: c.expiresAt, isActive: c.isActive,
  };
  dialog.value = { visible: true, isEdit: true, id: c.id };
}

async function submit() {
  submitting.value = true;
  try {
    const payload: any = {
      code: form.value.code.toUpperCase(),
      discountType: form.value.discountType,
      discountValue: form.value.discountValue,
      ...(form.value.minimumOrderValue ? { minimumOrderValue: form.value.minimumOrderValue } : {}),
      ...(form.value.maxUsage ? { maxUsage: form.value.maxUsage } : {}),
      isSingleUse: form.value.isSingleUse,
      ...(form.value.expiresAt ? { expiresAt: form.value.expiresAt } : {}),
      ...(dialog.value.isEdit ? { isActive: form.value.isActive } : {}),
    };
    if (dialog.value.isEdit && dialog.value.id) {
      await couponApi.update(dialog.value.id, payload);
      ElMessage.success('Coupon updated');
    } else {
      await couponApi.create(payload);
      ElMessage.success('Coupon created');
    }
    dialog.value.visible = false;
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Operation failed');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.hint { font-size: 12px; color: #909399; margin-left: 6px; }
</style>
