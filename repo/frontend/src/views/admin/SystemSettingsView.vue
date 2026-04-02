<template>
  <div class="page-settings">
    <el-tabs v-model="activeTab">

      <!-- ---- System Settings ---- -->
      <el-tab-pane label="System Settings" name="settings">
        <el-card shadow="never" v-loading="loading">
          <el-form :model="settingsForm" label-position="top" label-width="300px">
            <el-divider content-position="left">Feature Flags</el-divider>
            <el-form-item label="Enable Stored Value">
              <el-switch v-model="storedValueEnabled" />
              <span class="hint">Allows students to top-up and spend stored value at checkout</span>
            </el-form-item>

            <el-divider content-position="left">Compensation Limits</el-divider>
            <el-form-item label="CSA max approval ($)">
              <el-input-number v-model="settingsForm.max_compensation_csa_dollars" :min="0" :max="1000" :step="5" />
            </el-form-item>
            <el-form-item label="Ops Manager max approval ($)">
              <el-input-number v-model="settingsForm.max_compensation_ops_dollars" :min="0" :max="5000" :step="10" />
            </el-form-item>

            <el-divider content-position="left">Operations</el-divider>
            <el-form-item label="Anomaly escalation (minutes)">
              <el-input-number v-model="settingsForm.anomaly_escalation_minutes" :min="5" :max="120" />
            </el-form-item>
            <el-form-item label="Parking alert SLA (minutes)">
              <el-input-number v-model="settingsForm.parking_sla_minutes" :min="5" :max="60" />
            </el-form-item>
            <el-form-item label="Growth points per $1 spent">
              <el-input-number v-model="settingsForm.points_per_dollar" :min="0" :max="100" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="saving" @click="saveSettings">Save Settings</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- ---- Alert Thresholds ---- -->
      <el-tab-pane label="Alert Thresholds" name="thresholds">
        <el-card shadow="never">
          <div class="tab-header">
            <span>Configure metric thresholds that trigger on-screen banners and audible alerts</span>
            <el-button type="primary" size="small" :icon="Plus" @click="openThresholdDialog()">Add Threshold</el-button>
          </div>
          <el-table :data="thresholds" v-loading="loadingThresholds" stripe border style="width:100%;margin-top:12px">
            <el-table-column prop="metricName" label="Metric" min-width="200" />
            <el-table-column label="Condition" width="180">
              <template #default="{ row }">
                <code>{{ row.metricName }} {{ row.operator }} {{ row.value }}</code>
              </template>
            </el-table-column>
            <el-table-column label="Active" width="80">
              <template #default="{ row }">
                <el-switch v-model="row.isActive" @change="(v: boolean) => quickToggleThreshold(row, v)" />
              </template>
            </el-table-column>
            <el-table-column label="Actions" width="120">
              <template #default="{ row }">
                <el-button size="small" @click="openThresholdDialog(row)">Edit</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ---- Integration Keys ---- -->
      <el-tab-pane label="API Keys" name="keys">
        <el-card shadow="never">
          <div class="tab-header">
            <span>Manage HMAC-SHA256 signing keys for hardware and carrier integrations</span>
            <el-button type="primary" size="small" :icon="Plus" @click="openKeyDialog">New Key</el-button>
          </div>
          <el-table :data="keys" v-loading="loadingKeys" stripe border style="width:100%;margin-top:12px">
            <el-table-column prop="name"  label="Name"  min-width="160" />
            <el-table-column prop="keyId" label="Key ID" min-width="200">
              <template #default="{ row }"><code>{{ row.keyId }}</code></template>
            </el-table-column>
            <el-table-column prop="scope" label="Scope" width="120">
              <template #default="{ row }"><el-tag size="small">{{ row.scope }}</el-tag></template>
            </el-table-column>
            <el-table-column label="Active" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'danger'" size="small">{{ row.isActive ? 'Yes' : 'No' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="lastUsedAt" label="Last Used" width="160">
              <template #default="{ row }">{{ row.lastUsedAt ? fmtDate(row.lastUsedAt) : 'Never' }}</template>
            </el-table-column>
            <el-table-column label="Actions" width="200">
              <template #default="{ row }">
                <el-button size="small" @click="rotateKey(row)">Rotate</el-button>
                <el-button size="small" type="danger" @click="deactivateKey(row)">Deactivate</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ---- Backup Policy ---- -->
      <el-tab-pane label="Backups" name="backups">
        <el-card shadow="never" v-loading="loadingBackups">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="Schedule">Daily at 02:00 UTC</el-descriptions-item>
            <el-descriptions-item label="Retention">14 days</el-descriptions-item>
            <el-descriptions-item label="Backup Location">/backups (separate volume)</el-descriptions-item>
            <el-descriptions-item label="Restore-test">Automatic after each backup</el-descriptions-item>
          </el-descriptions>
          <h4 style="margin-top:20px;margin-bottom:12px">Backup History</h4>
          <el-table :data="backups" stripe border>
            <el-table-column prop="fileName"    label="File"   min-width="240" />
            <el-table-column prop="status"      label="Status" width="110">
              <template #default="{ row }">
                <el-tag :type="row.status === 'completed' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="verifyStatus" label="Verified" width="110">
              <template #default="{ row }">
                <el-tag :type="row.verifyStatus === 'passed' ? 'success' : row.verifyStatus === 'failed' ? 'danger' : 'info'" size="small">
                  {{ row.verifyStatus }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="startedAt" label="Run At" width="160">
              <template #default="{ row }">{{ fmtDate(row.startedAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Threshold Dialog -->
    <el-dialog v-model="thresholdVisible" title="Alert Threshold" width="420px">
      <el-form :model="thresholdForm" label-position="top">
        <el-form-item label="Metric Name">
          <el-input v-model="thresholdForm.metricName" placeholder="e.g. http_p95_latency_ms" />
        </el-form-item>
        <el-form-item label="Operator">
          <el-select v-model="thresholdForm.operator" style="width:100%">
            <el-option label="Greater than (gt)"           value="gt" />
            <el-option label="Less than (lt)"              value="lt" />
            <el-option label="Greater than or equal (gte)" value="gte" />
            <el-option label="Less than or equal (lte)"    value="lte" />
          </el-select>
        </el-form-item>
        <el-form-item label="Threshold Value">
          <el-input-number v-model="thresholdForm.value" style="width:100%" />
        </el-form-item>
        <el-form-item label="Active">
          <el-switch v-model="thresholdForm.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="thresholdVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveThreshold">Save</el-button>
      </template>
    </el-dialog>

    <!-- New Key Dialog -->
    <el-dialog v-model="keyVisible" title="Create Integration Key" width="420px">
      <el-form :model="keyForm" label-position="top">
        <el-form-item label="Name">
          <el-input v-model="keyForm.name" placeholder="e.g. Classroom Hardware Node A" />
        </el-form-item>
        <el-form-item label="Scope">
          <el-select v-model="keyForm.scope" style="width:100%">
            <el-option label="Classroom hardware" value="classroom" />
            <el-option label="Parking system"     value="parking" />
            <el-option label="Carrier connector"  value="carrier" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keyVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreateKey">Create</el-button>
      </template>
    </el-dialog>

    <!-- Key Created — show secret ONCE -->
    <el-dialog v-model="keySecretVisible" title="Integration Key Created" width="520px" :close-on-click-modal="false">
      <el-alert type="error" :closable="false" show-icon
        title="Copy the secret now — it will never be shown again after closing this dialog." style="margin-bottom:16px" />
      <el-descriptions :column="1" border>
        <el-descriptions-item label="Key ID"><code>{{ newKeyResult?.keyId }}</code></el-descriptions-item>
        <el-descriptions-item label="Secret">
          <div class="secret-box">
            <code>{{ newKeyResult?.secret }}</code>
            <el-button size="small" :icon="CopyDocument" @click="copySecret">Copy</el-button>
          </div>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button type="danger" @click="keySecretVisible = false">I have saved the secret — Close</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, CopyDocument } from '@element-plus/icons-vue';
import { settingsApi, integrationKeyApi, type AlertThreshold, type IntegrationKey } from '@/api/admin';

const activeTab = ref('settings');
const loading   = ref(false);
const saving    = ref(false);

// ---- Settings ----
const settingsForm = reactive<Record<string, number>>({
  max_compensation_csa_dollars: 25,
  max_compensation_ops_dollars: 100,
  anomaly_escalation_minutes: 30,
  parking_sla_minutes: 15,
  points_per_dollar: 1,
});
const storedValueEnabled = ref(false);

async function loadSettings() {
  loading.value = true;
  try {
    const res = await settingsApi.getAll() as unknown as { data: Record<string, string> };
    const s = res.data;
    storedValueEnabled.value = s['stored_value_enabled'] === 'true';
    for (const k of Object.keys(settingsForm)) {
      if (s[k]) settingsForm[k] = parseFloat(s[k]);
    }
  } finally { loading.value = false; }
}

async function saveSettings() {
  saving.value = true;
  try {
    const updates: Record<string, string> = { stored_value_enabled: String(storedValueEnabled.value) };
    for (const [k, v] of Object.entries(settingsForm)) updates[k] = String(v);
    await settingsApi.update(updates);
    ElMessage.success('Settings saved');
  } finally { saving.value = false; }
}

// ---- Thresholds ----
const loadingThresholds = ref(false);
const thresholds        = ref<AlertThreshold[]>([]);
const thresholdVisible  = ref(false);
const thresholdForm     = reactive({ metricName: '', operator: 'gt', value: 0, isActive: true });

async function loadThresholds() {
  loadingThresholds.value = true;
  try {
    const res = await settingsApi.getThresholds() as unknown as { data: AlertThreshold[] };
    thresholds.value = res.data;
  } finally { loadingThresholds.value = false; }
}

function openThresholdDialog(t?: AlertThreshold) {
  Object.assign(thresholdForm, t ?? { metricName: '', operator: 'gt', value: 0, isActive: true });
  thresholdVisible.value = true;
}

async function saveThreshold() {
  saving.value = true;
  try {
    await settingsApi.upsertThreshold(thresholdForm);
    ElMessage.success('Threshold saved');
    thresholdVisible.value = false;
    await loadThresholds();
  } finally { saving.value = false; }
}

async function quickToggleThreshold(t: AlertThreshold, v: boolean) {
  await settingsApi.upsertThreshold({ ...t, isActive: v });
}

// ---- Integration Keys ----
const loadingKeys      = ref(false);
const keys             = ref<IntegrationKey[]>([]);
const keyVisible       = ref(false);
const keySecretVisible = ref(false);
const keyForm          = reactive({ name: '', scope: 'classroom' });
const newKeyResult     = ref<{ keyId: string; secret: string } | null>(null);

async function loadKeys() {
  loadingKeys.value = true;
  try {
    const res = await integrationKeyApi.list() as unknown as { data: IntegrationKey[] };
    keys.value = res.data;
  } finally { loadingKeys.value = false; }
}

function openKeyDialog() { Object.assign(keyForm, { name: '', scope: 'classroom' }); keyVisible.value = true; }

async function handleCreateKey() {
  saving.value = true;
  try {
    const res = await integrationKeyApi.create(keyForm.name, keyForm.scope) as unknown as { data: { keyId: string; secret: string } };
    newKeyResult.value = res.data;
    keyVisible.value = false;
    keySecretVisible.value = true;
    await loadKeys();
  } finally { saving.value = false; }
}

async function rotateKey(key: IntegrationKey) {
  await ElMessageBox.confirm(`Rotate key for "${key.name}"? The old key will stop working immediately.`, 'Confirm Rotate', { type: 'warning' });
  const res = await integrationKeyApi.rotate(key.id) as unknown as { data: { keyId: string; secret: string } };
  newKeyResult.value = res.data;
  keySecretVisible.value = true;
  await loadKeys();
}

async function deactivateKey(key: IntegrationKey) {
  await ElMessageBox.confirm(`Deactivate key "${key.name}"?`, 'Confirm', { type: 'warning' });
  await integrationKeyApi.deactivate(key.id);
  ElMessage.success('Key deactivated');
  await loadKeys();
}

function copySecret() {
  if (newKeyResult.value?.secret) {
    navigator.clipboard.writeText(newKeyResult.value.secret);
    ElMessage.success('Secret copied to clipboard');
  }
}

// ---- Backups ----
const loadingBackups = ref(false);
const backups        = ref<unknown[]>([]);

async function loadBackups() {
  loadingBackups.value = true;
  try {
    const res = await settingsApi.getBackups() as unknown as { data: unknown[] };
    backups.value = res.data;
  } finally { loadingBackups.value = false; }
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

onMounted(async () => {
  await loadSettings();
  await loadThresholds();
  await loadKeys();
  await loadBackups();
});
</script>

<style scoped>
.page-settings { padding: 0; }
.tab-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; color: #606266; font-size: 14px; }
.hint { font-size: 12px; color: #909399; margin-left: 12px; }
.secret-box { display: flex; align-items: center; gap: 12px; }
.secret-box code { font-size: 13px; background: #f5f7fa; padding: 4px 8px; border-radius: 4px; word-break: break-all; }
</style>
