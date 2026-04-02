<template>
  <div class="page-classes">
    <div class="page-header">
      <span class="page-title">Classes</span>
      <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openDialog()">Add Class</el-button>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-select v-model="filterSem" placeholder="All Semesters" clearable style="width:200px" @change="load">
          <el-option v-for="s in semesters" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-select v-model="filterDept" placeholder="All Departments" clearable style="width:200px" @change="load">
          <el-option v-for="d in departments" :key="d.id" :label="`${d.code} — ${d.name}`" :value="d.id" />
        </el-select>
      </div>
      <el-table :data="classes" v-loading="loading" stripe border style="width:100%;margin-top:12px">
        <el-table-column prop="name"   label="Name"       min-width="200" />
        <el-table-column label="Course" min-width="140">
          <template #default="{ row }">{{ row.course?.code }} — {{ row.course?.name }}</template>
        </el-table-column>
        <el-table-column label="Semester" width="130">
          <template #default="{ row }">{{ row.semester?.name }}</template>
        </el-table-column>
        <el-table-column prop="roomNumber" label="Room" width="80" />
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

    <el-dialog v-model="visible" :title="form.id ? 'Edit Class' : 'Add Class'" width="480px">
      <el-form :model="form" label-position="top">
        <el-form-item label="Name"><el-input v-model="form.name" placeholder="e.g. Intro to CS — Section A" /></el-form-item>
        <el-form-item label="Course">
          <el-select v-model="form.courseId" style="width:100%" filterable>
            <el-option v-for="c in courses" :key="c.id" :label="`${c.code} — ${c.name}`" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Department">
          <el-select v-model="form.departmentId" style="width:100%">
            <el-option v-for="d in departments" :key="d.id" :label="`${d.code} — ${d.name}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Semester">
          <el-select v-model="form.semesterId" style="width:100%">
            <el-option v-for="s in semesters" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Room Number (optional)"><el-input v-model="form.roomNumber" /></el-form-item>
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
import { classApi, courseApi, departmentApi, semesterApi, type ClassRecord, type Course, type Department, type Semester } from '@/api/master-data';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const canWrite = computed(() => auth.can('master-data:write'));

const loading     = ref(false);
const saving      = ref(false);
const visible     = ref(false);
const classes     = ref<ClassRecord[]>([]);
const courses     = ref<Course[]>([]);
const departments = ref<Department[]>([]);
const semesters   = ref<Semester[]>([]);
const filterSem   = ref('');
const filterDept  = ref('');
const form = reactive({ id: '', name: '', courseId: '', departmentId: '', semesterId: '', roomNumber: '', isActive: true });

async function load() {
  loading.value = true;
  try {
    const res = await classApi.list({ semesterId: filterSem.value || undefined, departmentId: filterDept.value || undefined }) as unknown as { data: { data: ClassRecord[] } };
    classes.value = res.data.data;
  } finally { loading.value = false; }
}

function openDialog(cls?: ClassRecord) {
  Object.assign(form, cls
    ? { id: cls.id, name: cls.name, courseId: cls.courseId, departmentId: cls.departmentId, semesterId: cls.semesterId, roomNumber: cls.roomNumber ?? '', isActive: cls.isActive }
    : { id: '', name: '', courseId: '', departmentId: '', semesterId: '', roomNumber: '', isActive: true });
  visible.value = true;
}

async function doSave() {
  if (!form.name || !form.courseId || !form.departmentId || !form.semesterId) { ElMessage.warning('Name, Course, Department and Semester required'); return; }
  saving.value = true;
  try {
    if (form.id) {
      await classApi.update(form.id, { name: form.name, courseId: form.courseId, departmentId: form.departmentId, semesterId: form.semesterId, roomNumber: form.roomNumber || null, isActive: form.isActive });
    } else {
      await classApi.create({ name: form.name, courseId: form.courseId, departmentId: form.departmentId, semesterId: form.semesterId, roomNumber: form.roomNumber || null });
    }
    ElMessage.success('Saved');
    visible.value = false;
    await load();
  } finally { saving.value = false; }
}

onMounted(async () => {
  const [deptRes, semRes, courseRes] = await Promise.all([
    departmentApi.list(true) as unknown as Promise<{ data: { data: Department[] } }>,
    semesterApi.list()       as unknown as Promise<{ data: { data: Semester[] } }>,
    courseApi.list()         as unknown as Promise<{ data: { data: Course[] } }>,
  ]);
  departments.value = deptRes.data.data;
  semesters.value   = semRes.data.data;
  courses.value     = courseRes.data.data;
  await load();
});
</script>

<style scoped>
.page-classes { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.page-title { font-size: 18px; font-weight: 600; }
.toolbar { display: flex; gap: 12px; }
</style>
