<template>
  <div class="view-page">
    <div class="page-header">
      <el-button plain @click="$router.push('/after-sales')">← Back</el-button>
      <h2>Ticket — {{ ticket?.type ? formatType(ticket.type) : '' }}</h2>
      <div v-if="ticket" class="header-tags">
        <el-tag :type="statusTagType(ticket.status)">{{ formatStatus(ticket.status) }}</el-tag>
        <el-tag :type="slaTagType(ticket.slaStatus ?? '')">SLA: {{ ticket.slaStatus }}</el-tag>
      </div>
    </div>

    <div v-if="loading" v-loading="true" style="height:200px;" />

    <template v-else-if="ticket">
      <el-row :gutter="20">
        <!-- Left: info + status + compensation -->
        <el-col :span="14">
          <el-card header="Ticket Info">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="Student">{{ ticket.student?.fullName ?? ticket.studentId }}</el-descriptions-item>
              <el-descriptions-item label="Description">{{ ticket.description }}</el-descriptions-item>
              <el-descriptions-item label="SLA Deadline">{{ new Date(ticket.slaDeadlineAt).toLocaleString() }}</el-descriptions-item>
              <el-descriptions-item v-if="ticket.shipment" label="Shipment">{{ ticket.shipmentId }}</el-descriptions-item>
              <el-descriptions-item v-if="ticket.parcel" label="Parcel">{{ ticket.parcel.trackingNumber }}</el-descriptions-item>
              <el-descriptions-item v-if="ticket.resolvedAt" label="Resolved At">{{ new Date(ticket.resolvedAt).toLocaleString() }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- Status transitions -->
          <el-card header="Update Status" style="margin-top:16px;">
            <div class="status-row">
              <el-select v-model="newStatus" placeholder="Select status" style="width:180px;" clearable>
                <el-option v-for="s in nextStatuses" :key="s" :label="formatStatus(s)" :value="s" />
              </el-select>
              <el-input v-model="statusNote" placeholder="Note (optional)" style="flex:1;" />
              <el-button type="primary" :disabled="!newStatus" :loading="updatingStatus" @click="doUpdateStatus">
                Update
              </el-button>
            </div>
          </el-card>

          <!-- Compensations -->
          <el-card style="margin-top:16px;">
            <template #header>
              <div class="card-header">
                <span>Compensations</span>
                <el-button size="small" @click="suggestComp" :loading="suggesting">Auto-Suggest</el-button>
              </div>
            </template>
            <el-table :data="ticket.compensations ?? []" size="small">
              <el-table-column label="Type" prop="type" width="110" />
              <el-table-column label="Amount" width="100">
                <template #default="{ row }">${{ Number(row.amount).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="Status" width="130">
                <template #default="{ row }">
                  <el-tag :type="compStatusTag(row.status)" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="Actions" width="160">
                <template #default="{ row }">
                  <template v-if="row.status === 'suggested'">
                    <el-button size="small" type="success" @click="approveComp(row.id)">Approve</el-button>
                    <el-button size="small" type="danger" plain @click="rejectComp(row.id)">Reject</el-button>
                  </template>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <!-- Right: evidence + timeline -->
        <el-col :span="10">
          <!-- Evidence upload -->
          <el-card header="Evidence">
            <el-upload
              :auto-upload="false"
              :show-file-list="true"
              accept="image/jpeg,image/png"
              :before-upload="validateFile"
              :on-change="handleFileChange"
              drag
            >
              <el-icon><i-ep-upload-filled /></el-icon>
              <div class="upload-text">Drop JPEG/PNG here (max 10MB)</div>
            </el-upload>
            <el-button style="margin-top:8px;" :loading="uploadingEvidence" :disabled="!pendingFile" @click="submitEvidence">
              Upload Image
            </el-button>

            <el-divider />
            <el-input v-model="textNote" type="textarea" :rows="2" placeholder="Add text note…" />
            <el-button style="margin-top:6px;" :loading="addingNote" :disabled="!textNote" @click="submitTextNote">
              Add Note
            </el-button>

            <el-divider />
            <div v-for="ev in ticket.evidenceFiles ?? []" :key="ev.id" class="evidence-item">
              <el-tag v-if="ev.type === 'text'" type="info" size="small">Note</el-tag>
              <el-tag v-else size="small">Photo</el-tag>
              <span class="evidence-content">{{ ev.type === 'text' ? ev.textNote : ev.filePath }}</span>
            </div>
          </el-card>

          <!-- Timeline -->
          <el-card header="Timeline" style="margin-top:16px;">
            <el-timeline>
              <el-timeline-item
                v-for="entry in ticket.timeline ?? []"
                :key="entry.id"
                :timestamp="new Date(entry.createdAt).toLocaleString()"
              >
                <strong>{{ entry.action }}</strong>
                <div v-if="entry.note" class="tl-note">{{ entry.note }}</div>
              </el-timeline-item>
            </el-timeline>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { afterSalesApi, type AfterSalesTicket, type TicketStatus } from '../../api/after-sales';

const route   = useRoute();
const ticket  = ref<AfterSalesTicket | null>(null);
const loading = ref(false);
const newStatus    = ref<TicketStatus | ''>('');
const statusNote   = ref('');
const updatingStatus = ref(false);
const suggesting   = ref(false);
const pendingFile  = ref<File | null>(null);
const uploadingEvidence = ref(false);
const textNote     = ref('');
const addingNote   = ref(false);

const NEXT_STATUS: Record<TicketStatus, TicketStatus[]> = {
  open:             ['under_review', 'closed'],
  under_review:     ['pending_approval', 'closed'],
  pending_approval: ['resolved', 'closed'],
  resolved:         ['closed'],
  closed:           [],
};

const nextStatuses = computed<TicketStatus[]>(() =>
  ticket.value ? (NEXT_STATUS[ticket.value.status] ?? []) : [],
);

async function load() {
  loading.value = true;
  try {
    const res = await afterSalesApi.getById(route.params.id as string);
    ticket.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function doUpdateStatus() {
  if (!ticket.value || !newStatus.value) return;
  updatingStatus.value = true;
  try {
    const res = await afterSalesApi.updateStatus(ticket.value.id, newStatus.value, statusNote.value || undefined);
    ticket.value = res.data.data;
    ElMessage.success('Status updated');
    newStatus.value = '';
    statusNote.value = '';
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Update failed');
  } finally {
    updatingStatus.value = false;
  }
}

async function suggestComp() {
  if (!ticket.value) return;
  suggesting.value = true;
  try {
    await afterSalesApi.suggestCompensation(ticket.value.id);
    ElMessage.success('Compensation suggested');
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed');
  } finally {
    suggesting.value = false;
  }
}

async function approveComp(cid: string) {
  if (!ticket.value) return;
  try {
    await afterSalesApi.approveCompensation(ticket.value.id, cid);
    ElMessage.success('Approved');
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Approval failed');
  }
}

async function rejectComp(cid: string) {
  if (!ticket.value) return;
  try {
    await afterSalesApi.rejectCompensation(ticket.value.id, cid);
    ElMessage.success('Rejected');
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Rejection failed');
  }
}

function validateFile(file: File) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    ElMessage.error('Only JPEG and PNG files allowed');
    return false;
  }
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('File must be under 10 MB');
    return false;
  }
  return false; // prevent auto-upload
}

function handleFileChange(uploadFile: any) {
  if (uploadFile.raw) pendingFile.value = uploadFile.raw;
}

async function submitEvidence() {
  if (!ticket.value || !pendingFile.value) return;
  uploadingEvidence.value = true;
  try {
    await afterSalesApi.uploadEvidence(ticket.value.id, pendingFile.value);
    ElMessage.success('Evidence uploaded');
    pendingFile.value = null;
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Upload failed');
  } finally {
    uploadingEvidence.value = false;
  }
}

async function submitTextNote() {
  if (!ticket.value || !textNote.value) return;
  addingNote.value = true;
  try {
    await afterSalesApi.addTextEvidence(ticket.value.id, textNote.value);
    ElMessage.success('Note added');
    textNote.value = '';
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to add note');
  } finally {
    addingNote.value = false;
  }
}

function formatType(t: string) {
  return t === 'lost_item' ? 'Lost Item' : t.charAt(0).toUpperCase() + t.slice(1);
}
function formatStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function statusTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const m: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    open: 'warning', under_review: '', pending_approval: 'warning', resolved: 'success', closed: 'info',
  };
  return m[s] ?? 'info';
}
function slaTagType(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const m: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    within_sla: 'success', at_risk: 'warning', breached: 'danger', closed: 'info',
  };
  return m[s] ?? 'info';
}
function compStatusTag(s: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  return s === 'approved' || s === 'applied' ? 'success' : s === 'rejected' ? 'danger' : s === 'suggested' ? 'warning' : 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.page-header h2 { margin: 0; flex: 1; }
.header-tags { display: flex; gap: 6px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.status-row { display: flex; gap: 8px; align-items: center; }
.upload-text { font-size: 13px; color: #606266; }
.evidence-item { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.evidence-content { font-size: 12px; color: #606266; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tl-note { font-size: 13px; color: #606266; margin-top: 2px; }
</style>
