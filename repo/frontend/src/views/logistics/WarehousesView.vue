<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Warehouses</h2>
      <el-button type="primary" @click="openCreate">Add Warehouse</el-button>
    </div>

    <el-table v-loading="loading" :data="warehouses" stripe>
      <el-table-column label="Name" prop="name" min-width="180" />
      <el-table-column label="Address" prop="address" min-width="300" show-overflow-tooltip />
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

    <!-- Create / Edit dialog -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? 'Edit Warehouse' : 'Add Warehouse'" width="480px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" placeholder="Warehouse name" />
        </el-form-item>
        <el-form-item label="Address" required>
          <el-input v-model="form.address" type="textarea" :rows="2" placeholder="Full address" />
        </el-form-item>
        <el-form-item v-if="dialog.isEdit" label="Active">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!form.name || !form.address" @click="submit">
          {{ dialog.isEdit ? 'Save' : 'Create' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { warehouseApi, type Warehouse } from '../../api/logistics';

const warehouses = ref<Warehouse[]>([]);
const loading    = ref(false);
const submitting = ref(false);

const dialog = ref<{ visible: boolean; isEdit: boolean; id: string | null }>({
  visible: false, isEdit: false, id: null,
});
const form = ref({ name: '', address: '', isActive: true });

async function load() {
  loading.value = true;
  try {
    const res = await warehouseApi.list();
    warehouses.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  form.value = { name: '', address: '', isActive: true };
  dialog.value = { visible: true, isEdit: false, id: null };
}
function openEdit(w: Warehouse) {
  form.value = { name: w.name, address: w.address, isActive: w.isActive };
  dialog.value = { visible: true, isEdit: true, id: w.id };
}

async function submit() {
  submitting.value = true;
  try {
    if (dialog.value.isEdit && dialog.value.id) {
      await warehouseApi.update(dialog.value.id, form.value);
      ElMessage.success('Warehouse updated');
    } else {
      await warehouseApi.create({ name: form.value.name, address: form.value.address });
      ElMessage.success('Warehouse created');
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
