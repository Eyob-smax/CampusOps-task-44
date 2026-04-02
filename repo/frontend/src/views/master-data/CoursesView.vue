<template>
  <div class="page-courses">
    <div class="page-header">
      <span class="page-title">Courses</span>
      <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openDialog()">Add Course</el-button>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-select v-model="filterDept" placeholder="All Departments" clearable style="width:220px" @change="load">
          <el-option v-for="d in departments" :key="d.id" :label="`${d.code} — ${d.name}`" :value="d.id" />
        </el-select>
      </div>
      <el-table :data="courses" v-loading="loading" stripe border style="width:100%;margin-top:12px">
        <el-table-column prop="code"   label="Code"       width="100" />
        <el-table-column prop="name"   label="Name"       min-width="220" />
        <el-table-column label="Department" min-width="160">
          <template #default="{ row }">{{ row.department?.name }}</template>
        </el-table-column>
        <el-table-column label="Status" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">{{ row.isActive ? 'Active' : 'Inactive' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="80" v-if="canWrite">
          <template #default="{ row }"><el-button size="small" @click="openDialog(row)">Edit</el-button></template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="form.id ? 'Edit Course' : 'Add Course'" width="440px">
      <el-form :model="form" label-position="top">
        <el-form-item label="Code"><el-input v-model="form.code" placeholder="e.g. CS101" /></el-form-item>
        <el-form-item label="Name"><el-input v-model="form.name" placeholder="Course name" /></el-form-item>
        <el-form-item label="Department">
          <el-select v-model="form.departmentId" style="width:100%">
            <el-option v-for="d in departments" :key="d.id" :label="`${d.code} — ${d.name}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.id" label="Active"><el-switch v-model="form.isActive" /></el-form-item>
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
import { courseApi, departmentApi, type Course, type Department } from '@/api/master-data';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canWrite = computed(() => auth.can('master-data:write'));

const loading     = ref(false);
const saving      = ref(false);
const visible     = ref(false);
const courses     = ref<Course[]>([]);
const departments = ref<Department[]>([]);
const filterDept  = ref('');
const form = reactive({ id: '', code: '', name: '', departmentId: '', isActive: true });

async function load() {
  loading.value = true;
  try {
    const res = await courseApi.list({ departmentId: filterDept.value || undefined }) as unknown as { data: { data: Course[] } };
    courses.value = res.data.data;
  } finally { loading.value = false; }
}

async function loadDepts() {
  const res = await departmentApi.list(true) as unknown as { data: { data: Department[] } };
  departments.value = res.data.data;
}

function openDialog(course?: Course) {
  Object.assign(form, course
    ? { id: course.id, code: course.code, name: course.name, departmentId: course.departmentId, isActive: course.isActive }
    : { id: '', code: '', name: '', departmentId: '', isActive: true });
  visible.value = true;
}

async function doSave() {
  if (!form.code || !form.name || !form.departmentId) { ElMessage.warning('All fields required'); return; }
  saving.value = true;
  try {
    if (form.id) {
      await courseApi.update(form.id, { code: form.code, name: form.name, departmentId: form.departmentId, isActive: form.isActive });
    } else {
      await courseApi.create({ code: form.code, name: form.name, departmentId: form.departmentId });
    }
    ElMessage.success('Saved');
    visible.value = false;
    await load();
  } finally { saving.value = false; }
}

onMounted(async () => { await loadDepts(); await load(); });
</script>

<style scoped>
.page-courses { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; }
.toolbar { display: flex; gap: 12px; }
</style>
