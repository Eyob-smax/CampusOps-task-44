<template>
  <div class="view-page">
    <div class="page-header">
      <el-button plain @click="$router.push('/after-sales')">← Back</el-button>
      <h2>New After-Sales Ticket</h2>
    </div>

    <el-form :model="form" label-width="160px" style="max-width:640px;">
      <el-form-item label="Student ID" required>
        <el-input v-model="form.studentId" placeholder="Student UUID" />
      </el-form-item>
      <el-form-item label="Type" required>
        <el-radio-group v-model="form.type">
          <el-radio value="delay">Delay</el-radio>
          <el-radio value="dispute">Dispute</el-radio>
          <el-radio value="lost_item">Lost Item</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="Description" required>
        <el-input v-model="form.description" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item label="Shipment ID">
        <el-input v-model="form.shipmentId" placeholder="Optional UUID" />
      </el-form-item>
      <el-form-item label="Parcel ID">
        <el-input v-model="form.parcelId" placeholder="Optional UUID" />
      </el-form-item>
      <el-form-item>
        <el-alert type="info" :closable="false" style="width:100%;">
          SLA: Delay = 72h · Dispute = 48h · Lost Item = 96h
        </el-alert>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="submitting"
          :disabled="!form.studentId || !form.type || !form.description"
          @click="submit">
          Submit Ticket
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { afterSalesApi, type TicketType } from '../../api/after-sales';

const router     = useRouter();
const submitting = ref(false);
const form = ref({
  studentId: '', type: 'delay' as TicketType,
  description: '', shipmentId: '', parcelId: '',
});

async function submit() {
  submitting.value = true;
  try {
    const res = await afterSalesApi.create({
      studentId: form.value.studentId,
      type: form.value.type,
      description: form.value.description,
      ...(form.value.shipmentId ? { shipmentId: form.value.shipmentId } : {}),
      ...(form.value.parcelId ? { parcelId: form.value.parcelId } : {}),
    });
    ElMessage.success('Ticket created');
    router.push(`/after-sales/${res.data.data.id}`);
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to create ticket');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.page-header h2 { margin: 0; }
</style>
