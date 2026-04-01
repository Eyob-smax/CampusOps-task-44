<template>
  <div class="page-semesters">
    <div class="page-header">
      <span class="page-title">Semesters</span>
      <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openDialog()">Add Semester</el-button>
    </div>

    <el-card shadow="never" v-loading="loading">
      <el-table :data="semesters" stripe border style="width:100%">
        <el-table-column prop="name"      label="Name"       min-width="180" />
        <el-table-column prop="startDate" label="Start"      width="120">
          <template #default="{ row }">{{ fmtDate(row.startDate) }}</template>
        </el-table-column>
        <el-table-column prop="endDate"   label="End"        width="120">
          <template #default="{ row }">{{ fmtDate(row.endDate) }}</template>
        </el-table-column>
        <el-table-column label="Status"   width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? 'Active' : 'Inactive' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions"  width="80" v-if="canWrite">
          <template #default="{ row }">
            <el-button size="small" @click="openDialog(row)">Edit</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="form.id ? 'Edit Semester' : 'Add Semester'" width="440px">
      <el-form :model="form" label-position="top">
        <el-form-item label="Name"><el-input v-model="form.name" placeholder="e.g. Fall 2026" /></el-form-item>
        <el-form-item label="Start Date">
          <el-date-picker v-model="form.startDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="End Date">
          <el-date-picker v-model="form.endDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
        </el-form-item>
        <el-form-item label="Active"><el-switch v-model="form.isActive" /></el-form-item>
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
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { semesterApi, type Semester } from '@/api/master-data';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canWrite = computed(() => auth.can('master-data:write'));

const loading  = ref(false);
const saving   = ref(false);
const visible  = ref(false);
const semesters = ref<Semester[]>([]);
const form = reactive({ id: '', name: '', startDate: '', endDate: '', isActive: true });

async function load() {
  loading.value = true;
  try {
    const res = await semesterApi.list() as unknown as { data: { data: Semester[] } };
    semesters.value = res.data.data;
  } finally { loading.value = false; }
}

function openDialog(sem?: Semester) {
  Object.assign(form, sem
    ? { id: sem.id, name: sem.name, startDate: sem.startDate.slice(0, 10), endDate: sem.endDate.slice(0, 10), isActive: sem.isActive }
    : { id: '', name: '', startDate: '', endDate: '', isActive: true });
  visible.value = true;
}

async function doSave() {
  if (!form.name || !form.startDate || !form.endDate) { ElMessage.warning('All fields required'); return; }
  saving.value = true;
  try {
    if (form.id) {
      await semesterApi.update(form.id, { name: form.name, startDate: form.startDate, endDate: form.endDate, isActive: form.isActive });
    } else {
      await semesterApi.create({ name: form.name, startDate: form.startDate, endDate: form.endDate, isActive: form.isActive });
    }
    ElMessage.success('Saved');
    visible.value = false;
    await load();
  } finally { saving.value = false; }
}

function fmtDate(d: string) { return d ? d.slice(0, 10) : '—'; }

onMounted(load);
</script>

<style scoped>
.page-semesters { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; }
</style>
