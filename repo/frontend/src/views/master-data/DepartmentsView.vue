<template>
  <div class="page-departments">
    <div class="page-header">
      <span class="page-title">Departments</span>
      <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openDialog()">Add Department</el-button>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-table :data="departments" stripe border style="width:100%">
        <el-table-column prop="code"     label="Code"   width="100" />
        <el-table-column prop="name"     label="Name"   min-width="200" />
        <el-table-column label="Status"  width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? 'Active' : 'Inactive' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="160" v-if="canWrite">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">Edit</el-button>
            <el-button size="small" type="danger" :disabled="!row.isActive" @click="doDeactivate(row)">Deactivate</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="form.id ? 'Edit Department' : 'Add Department'" width="420px">
      <el-form :model="form" label-position="top">
        <el-form-item label="Code"><el-input v-model="form.code" placeholder="e.g. CS" /></el-form-item>
        <el-form-item label="Name"><el-input v-model="form.name" placeholder="e.g. Computer Science" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="doSave">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { departmentApi, type Department } from '@/api/master-data';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canWrite = computed(() => auth.can('master-data:write'));

const loading = ref(false);
const saving  = ref(false);
const visible = ref(false);
const departments = ref<Department[]>([]);
const form = reactive({ id: '', code: '', name: '' });

async function load() {
  loading.value = true;
  try {
    const res = await departmentApi.list() as unknown as { data: { data: Department[] } };
    departments.value = res.data.data;
  } finally { loading.value = false; }
}

function openDialog(dept?: Department) {
  Object.assign(form, dept ? { id: dept.id, code: dept.code, name: dept.name } : { id: '', code: '', name: '' });
  visible.value = true;
}

async function doSave() {
  if (!form.code || !form.name) { ElMessage.warning('Code and Name are required'); return; }
  saving.value = true;
  try {
    if (form.id) {
      await departmentApi.update(form.id, { code: form.code, name: form.name });
    } else {
      await departmentApi.create({ code: form.code, name: form.name });
    }
    ElMessage.success('Saved');
    visible.value = false;
    await load();
  } finally { saving.value = false; }
}

async function doDeactivate(dept: Department) {
  await ElMessageBox.confirm(`Deactivate "${dept.name}"?`, 'Confirm', { type: 'warning' });
  await departmentApi.deactivate(dept.id);
  ElMessage.success('Deactivated');
  await load();
}

onMounted(load);
</script>

<style scoped>
.page-departments { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; }
</style>
