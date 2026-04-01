<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Membership Tiers</h2>
      <el-button type="primary" @click="openCreate">Add Tier</el-button>
    </div>

    <el-table v-loading="loading" :data="tiers" stripe>
      <el-table-column label="Name" prop="name" min-width="140" />
      <el-table-column label="Discount" width="120">
        <template #default="{ row }">{{ Number(row.discountPercent).toFixed(1) }}%</template>
      </el-table-column>
      <el-table-column label="Points Threshold" width="160" prop="pointThreshold" />
      <el-table-column label="Benefits" prop="benefits" min-width="240" show-overflow-tooltip />
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

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? 'Edit Tier' : 'Add Tier'" width="480px">
      <el-form :model="form" label-width="150px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" placeholder="e.g. Gold, Silver" />
        </el-form-item>
        <el-form-item label="Discount (%)" required>
          <el-input-number v-model="form.discountPercent" :min="0" :max="100" :precision="2" />
        </el-form-item>
        <el-form-item label="Points Threshold" required>
          <el-input-number v-model="form.pointThreshold" :min="0" :precision="0" />
        </el-form-item>
        <el-form-item label="Benefits" required>
          <el-input v-model="form.benefits" type="textarea" :rows="3" placeholder="Describe tier benefits" />
        </el-form-item>
        <el-form-item v-if="dialog.isEdit" label="Active">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!form.name || !form.benefits" @click="submit">
          {{ dialog.isEdit ? 'Save' : 'Create' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { membershipApi, type MembershipTier } from '../../api/membership';

const tiers      = ref<MembershipTier[]>([]);
const loading    = ref(false);
const submitting = ref(false);

const dialog = ref<{ visible: boolean; isEdit: boolean; id: string | null }>({
  visible: false, isEdit: false, id: null,
});
const form = ref({ name: '', discountPercent: 0, pointThreshold: 0, benefits: '', isActive: true });

async function load() {
  loading.value = true;
  try {
    const res = await membershipApi.listTiers();
    tiers.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  form.value = { name: '', discountPercent: 0, pointThreshold: 0, benefits: '', isActive: true };
  dialog.value = { visible: true, isEdit: false, id: null };
}
function openEdit(t: MembershipTier) {
  form.value = { name: t.name, discountPercent: Number(t.discountPercent), pointThreshold: t.pointThreshold, benefits: t.benefits, isActive: t.isActive };
  dialog.value = { visible: true, isEdit: true, id: t.id };
}

async function submit() {
  submitting.value = true;
  try {
    if (dialog.value.isEdit && dialog.value.id) {
      await membershipApi.updateTier(dialog.value.id, form.value);
      ElMessage.success('Tier updated');
    } else {
      await membershipApi.createTier(form.value);
      ElMessage.success('Tier created');
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
</style>
