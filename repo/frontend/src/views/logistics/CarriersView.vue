<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Carriers</h2>
      <el-button type="primary" @click="openCreate">Add Carrier</el-button>
    </div>

    <el-table v-loading="loading" :data="carriers" stripe>
      <el-table-column label="Name" prop="name" min-width="160" />
      <el-table-column label="Code" prop="code" width="120" />
      <el-table-column label="Tracking URL" prop="trackingUrlTemplate" min-width="260" show-overflow-tooltip>
        <template #default="{ row }">{{ row.trackingUrlTemplate ?? '—' }}</template>
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

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? 'Edit Carrier' : 'Add Carrier'" width="480px">
      <el-form :model="form" label-width="130px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" placeholder="Carrier name" />
        </el-form-item>
        <el-form-item label="Code" required>
          <el-input v-model="form.code" placeholder="e.g. UPS, FEDEX" />
        </el-form-item>
        <el-form-item label="Tracking URL">
          <el-input v-model="form.trackingUrlTemplate" placeholder="https://track.example.com/{tracking_number}" />
        </el-form-item>
        <el-form-item v-if="dialog.isEdit" label="Active">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!form.name || !form.code" @click="submit">
          {{ dialog.isEdit ? 'Save' : 'Create' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { carrierApi, type Carrier } from '../../api/logistics';

const carriers   = ref<Carrier[]>([]);
const loading    = ref(false);
const submitting = ref(false);

const dialog = ref<{ visible: boolean; isEdit: boolean; id: string | null }>({
  visible: false, isEdit: false, id: null,
});
const form = ref({ name: '', code: '', trackingUrlTemplate: '', isActive: true });

async function load() {
  loading.value = true;
  try {
    const res = await carrierApi.list();
    carriers.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  form.value = { name: '', code: '', trackingUrlTemplate: '', isActive: true };
  dialog.value = { visible: true, isEdit: false, id: null };
}
function openEdit(c: Carrier) {
  form.value = { name: c.name, code: c.code, trackingUrlTemplate: c.trackingUrlTemplate ?? '', isActive: c.isActive };
  dialog.value = { visible: true, isEdit: true, id: c.id };
}

async function submit() {
  submitting.value = true;
  try {
    const payload = {
      name: form.value.name,
      code: form.value.code,
      trackingUrlTemplate: form.value.trackingUrlTemplate || undefined,
      ...(dialog.value.isEdit ? { isActive: form.value.isActive } : {}),
    };
    if (dialog.value.isEdit && dialog.value.id) {
      await carrierApi.update(dialog.value.id, payload);
      ElMessage.success('Carrier updated');
    } else {
      await carrierApi.create(payload as any);
      ElMessage.success('Carrier created');
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
