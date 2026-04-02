<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Shipping Fee Templates</h2>
      <el-button type="primary" @click="openCreate">Add Template</el-button>
    </div>

    <div class="filters">
      <el-select v-model="filterZone" placeholder="All zones" clearable style="width:200px;" @change="load">
        <el-option v-for="z in zones" :key="z.id" :label="z.name" :value="z.id" />
      </el-select>
    </div>

    <el-table v-loading="loading" :data="templates" stripe>
      <el-table-column label="Name" prop="name" min-width="160" />
      <el-table-column label="Zone" width="140">
        <template #default="{ row }">{{ zoneName(row.zoneId) }}</template>
      </el-table-column>
      <el-table-column label="Tier" prop="tier" width="120" />
      <el-table-column label="Base Fee" width="110">
        <template #default="{ row }">${{ Number(row.baseFee).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="Per Lb" width="100">
        <template #default="{ row }">${{ Number(row.perLbFee).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="AK / HI surcharge" width="170">
        <template #default="{ row }">
          ${{ Number(row.surchargeAk).toFixed(2) }} / ${{ Number(row.surchargeHi).toFixed(2) }}
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

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? 'Edit Template' : 'Add Template'" width="560px">
      <el-form :model="form" label-width="140px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="Zone" required>
          <el-select v-model="form.zoneId" style="width:100%;">
            <el-option v-for="z in zones" :key="z.id" :label="z.name" :value="z.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Tier" required>
          <el-input v-model="form.tier" placeholder="e.g. standard, express" />
        </el-form-item>
        <el-form-item label="Base Fee ($)" required>
          <el-input-number v-model="form.baseFee" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="Base Weight (lb)">
          <el-input-number v-model="form.baseWeightLb" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="Per Lb Fee ($)">
          <el-input-number v-model="form.perLbFee" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="Per Item Fee ($)">
          <el-input-number v-model="form.perItemFee" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="Max Items">
          <el-input-number v-model="form.maxItems" :min="1" :precision="0" />
        </el-form-item>
        <el-form-item label="AK Surcharge ($)">
          <el-input-number v-model="form.surchargeAk" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="HI Surcharge ($)">
          <el-input-number v-model="form.surchargeHi" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item v-if="dialog.isEdit" label="Active">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!form.name || !form.zoneId || !form.tier" @click="submit">
          {{ dialog.isEdit ? 'Save' : 'Create' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { shippingTemplateApi, deliveryZoneApi, type ShippingFeeTemplate, type DeliveryZone } from '../../api/logistics';

const templates  = ref<ShippingFeeTemplate[]>([]);
const zones      = ref<DeliveryZone[]>([]);
const loading    = ref(false);
const submitting = ref(false);
const filterZone = ref('');

const dialog = ref<{ visible: boolean; isEdit: boolean; id: string | null }>({
  visible: false, isEdit: false, id: null,
});
const form = ref({
  name: '', zoneId: '', tier: '',
  baseFee: 0, baseWeightLb: 0, perLbFee: 0,
  perItemFee: 0, maxItems: undefined as number | undefined,
  surchargeAk: 0, surchargeHi: 0, isActive: true,
});

async function load() {
  loading.value = true;
  try {
    const res = await shippingTemplateApi.list(filterZone.value ? { zoneId: filterZone.value } : {});
    templates.value = res.data.data;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const [, zonesRes] = await Promise.all([load(), deliveryZoneApi.list()]);
  zones.value = zonesRes.data.data;
});

function zoneName(zoneId: string) {
  return zones.value.find((z) => z.id === zoneId)?.name ?? zoneId;
}

function openCreate() {
  form.value = { name: '', zoneId: '', tier: '', baseFee: 0, baseWeightLb: 0, perLbFee: 0, perItemFee: 0, maxItems: undefined, surchargeAk: 0, surchargeHi: 0, isActive: true };
  dialog.value = { visible: true, isEdit: false, id: null };
}
function openEdit(t: ShippingFeeTemplate) {
  form.value = {
    name: t.name, zoneId: t.zoneId, tier: t.tier,
    baseFee: Number(t.baseFee), baseWeightLb: Number(t.baseWeightLb), perLbFee: Number(t.perLbFee),
    perItemFee: t.perItemFee ? Number(t.perItemFee) : 0,
    maxItems: t.maxItems ?? undefined,
    surchargeAk: Number(t.surchargeAk), surchargeHi: Number(t.surchargeHi),
    isActive: t.isActive,
  };
  dialog.value = { visible: true, isEdit: true, id: t.id };
}

async function submit() {
  submitting.value = true;
  try {
    const payload: any = { ...form.value };
    if (!payload.maxItems) delete payload.maxItems;
    if (!payload.perItemFee) delete payload.perItemFee;
    if (dialog.value.isEdit && dialog.value.id) {
      await shippingTemplateApi.update(dialog.value.id, payload);
      ElMessage.success('Template updated');
    } else {
      await shippingTemplateApi.create(payload);
      ElMessage.success('Template created');
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
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.filters { margin-bottom: 16px; }
</style>
