<template>
  <div class="page-users">
    <div class="page-header">
      <h2>User Management</h2>
      <el-button type="primary" :icon="Plus" @click="openCreate">New User</el-button>
    </div>

    <el-table :data="users" v-loading="loading" stripe border style="width:100%">
      <el-table-column prop="username" label="Username" min-width="140" />
      <el-table-column label="Role" min-width="200">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" size="small">{{ formatRole(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Status" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">
            {{ row.isActive ? 'Active' : 'Inactive' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="Created" width="160">
        <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="Actions" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openChangeRole(row)">Change Role</el-button>
          <el-button size="small" @click="openResetPw(row)">Reset PW</el-button>
          <el-button size="small" type="danger" :disabled="row.id === auth.user?.id || !row.isActive"
            @click="handleDeactivate(row)">Deactivate</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create User Dialog -->
    <el-dialog v-model="createVisible" title="Create User" width="480px" :close-on-click-modal="false">
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-position="top">
        <el-form-item label="Username" prop="username">
          <el-input v-model="createForm.username" placeholder="e.g. john.doe" />
        </el-form-item>
        <el-form-item label="Role" prop="role">
          <el-select v-model="createForm.role" style="width:100%">
            <el-option v-for="r in ROLES" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="Initial Password" prop="password">
          <el-input v-model="createForm.password" type="password" show-password />
          <div class="hint">Min 12 chars, uppercase, lowercase, digit, special char</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreate">Create</el-button>
      </template>
    </el-dialog>

    <!-- Change Role Dialog -->
    <el-dialog v-model="roleVisible" title="Change Role" width="400px">
      <el-form :model="roleForm" label-position="top">
        <el-descriptions :column="1" border class="mb-12">
          <el-descriptions-item label="User">{{ selectedUser?.username }}</el-descriptions-item>
          <el-descriptions-item label="Current Role">{{ formatRole(selectedUser?.role ?? '') }}</el-descriptions-item>
        </el-descriptions>
        <el-form-item label="New Role">
          <el-select v-model="roleForm.role" style="width:100%">
            <el-option v-for="r in ROLES" :key="r.value" :label="r.label" :value="r.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="handleChangeRole">Save</el-button>
      </template>
    </el-dialog>

    <!-- Reset Password Dialog -->
    <el-dialog v-model="resetVisible" title="Reset Password" width="400px">
      <el-alert type="warning" show-icon :closable="false"
        title="The user will be notified to change their password on next login." style="margin-bottom:16px" />
      <el-form :model="resetForm" label-position="top">
        <div style="margin-bottom:12px">User: <strong>{{ selectedUser?.username }}</strong></div>
        <el-form-item label="New Password">
          <el-input v-model="resetForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetVisible = false">Cancel</el-button>
        <el-button type="warning" :loading="saving" @click="handleResetPw">Reset Password</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { userApi, type AdminUser } from '@/api/admin';
import { useAuthStore } from '@/stores/auth';

const auth    = useAuthStore();
const loading = ref(false);
const saving  = ref(false);
const users   = ref<AdminUser[]>([]);

const createVisible = ref(false);
const roleVisible   = ref(false);
const resetVisible  = ref(false);
const selectedUser  = ref<AdminUser | null>(null);
const createFormRef = ref<FormInstance>();

const ROLES = [
  { value: 'administrator',          label: 'Administrator' },
  { value: 'operations_manager',     label: 'Operations Manager' },
  { value: 'classroom_supervisor',   label: 'Classroom Supervisor' },
  { value: 'customer_service_agent', label: 'Customer Service Agent' },
  { value: 'auditor',                label: 'Auditor' },
];

const createForm = reactive({ username: '', role: 'customer_service_agent', password: '' });
const roleForm   = reactive({ role: '' });
const resetForm  = reactive({ password: '' });

const createRules: FormRules = {
  username: [{ required: true, min: 3, message: 'Username required (min 3 chars)', trigger: 'blur' }],
  role:     [{ required: true, message: 'Role required', trigger: 'change' }],
  password: [{ required: true, min: 12, message: 'Password required (min 12 chars)', trigger: 'blur' }],
};

async function load() {
  loading.value = true;
  try {
    const res = await userApi.list() as unknown as { data: AdminUser[] };
    users.value = res.data;
  } catch {
    ElMessage.error('Failed to load users');
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(createForm, { username: '', role: 'customer_service_agent', password: '' });
  createVisible.value = true;
}
function openChangeRole(user: AdminUser) { selectedUser.value = user; roleForm.role = user.role; roleVisible.value = true; }
function openResetPw(user: AdminUser)    { selectedUser.value = user; resetForm.password = ''; resetVisible.value = true; }

async function handleCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    await userApi.create(createForm);
    ElMessage.success('User created successfully');
    createVisible.value = false;
    await load();
  } catch (e: unknown) {
    ElMessage.error((e as { error?: string })?.error ?? 'Failed to create user');
  } finally { saving.value = false; }
}

async function handleChangeRole() {
  if (!selectedUser.value) return;
  saving.value = true;
  try {
    await userApi.changeRole(selectedUser.value.id, roleForm.role);
    ElMessage.success('Role updated — user must re-login to apply new permissions');
    roleVisible.value = false;
    await load();
  } catch (e: unknown) {
    ElMessage.error((e as { error?: string })?.error ?? 'Failed to change role');
  } finally { saving.value = false; }
}

async function handleResetPw() {
  if (!selectedUser.value) return;
  saving.value = true;
  try {
    await userApi.resetPassword(selectedUser.value.id, resetForm.password);
    ElMessage.success('Password reset successfully');
    resetVisible.value = false;
  } catch (e: unknown) {
    ElMessage.error((e as { error?: string })?.error ?? 'Failed to reset password');
  } finally { saving.value = false; }
}

async function handleDeactivate(user: AdminUser) {
  await ElMessageBox.confirm(
    `Deactivate "${user.username}"? They will not be able to log in.`,
    'Confirm Deactivation', { type: 'warning', confirmButtonText: 'Deactivate', confirmButtonClass: 'el-button--danger' }
  );
  try {
    await userApi.deactivate(user.id);
    ElMessage.success('User deactivated');
    await load();
  } catch (e: unknown) {
    ElMessage.error((e as { error?: string })?.error ?? 'Failed to deactivate user');
  }
}

function formatRole(role: string) { return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function roleTagType(role: string): 'danger' | 'warning' | 'success' | 'info' | '' {
  return ({ administrator: 'danger', operations_manager: 'warning', classroom_supervisor: 'success', auditor: 'info' } as Record<string, 'danger'|'warning'|'success'|'info'|''>)[role] ?? '';
}
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }); }

onMounted(load);
</script>

<style scoped>
.page-users { padding: 0; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 22px; }
.hint { font-size: 12px; color: #909399; margin-top: 4px; }
.mb-12 { margin-bottom: 12px; }
</style>
