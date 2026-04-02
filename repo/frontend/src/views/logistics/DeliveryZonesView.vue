<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Delivery Zones</h2>
      <el-button type="primary" @click="openCreate">Add Zone</el-button>
    </div>

    <el-table v-loading="loading" :data="zones" stripe @row-click="openZoneDetail">
      <el-table-column label="Name" prop="name" min-width="160" />
      <el-table-column label="Region Code" prop="regionCode" width="130" />
      <el-table-column label="ZIP Codes" width="110">
        <template #default="{ row }">{{ row.zipCodes?.length ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="Templates" width="120">
        <template #default="{ row }">{{ row.shippingTemplates?.length ?? 0 }}</template>
      </el-table-column>
      <el-table-column label="Status" width="110">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
            {{ row.isActive ? 'Active' : 'Inactive' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Actions" width="130" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click.stop="openEdit(row)">Edit</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create / Edit zone dialog -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? 'Edit Zone' : 'Add Zone'" width="420px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="Region Code" required>
          <el-input v-model="form.regionCode" placeholder="e.g. US, AK, HI" />
        </el-form-item>
        <el-form-item v-if="dialog.isEdit" label="Active">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">Cancel</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!form.name || !form.regionCode" @click="submitZone">
          {{ dialog.isEdit ? 'Save' : 'Create' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ZIP management drawer -->
    <el-drawer v-model="zipDrawer.visible" title="Manage ZIPs" size="440px">
      <template v-if="zipDrawer.zone">
        <div class="zip-add">
          <el-input v-model="newZip" placeholder="ZIP code" style="width: 160px;" />
          <el-checkbox v-model="newZipNonServiceable">Non-serviceable</el-checkbox>
          <el-button type="primary" :loading="addingZip" :disabled="!newZip" @click="addZip">Add</el-button>
        </div>
        <el-table :data="zipDrawer.zone.zipCodes" size="small" style="margin-top: 16px;">
          <el-table-column label="ZIP" prop="zipCode" width="120" />
          <el-table-column label="Serviceable" width="160">
            <template #default="{ row }">
              <el-tag :type="row.isNonServiceable ? 'danger' : 'success'" size="small">
                {{ row.isNonServiceable ? 'Non-serviceable' : 'Serviceable' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="" width="80">
            <template #default="{ row }">
              <el-button size="small" type="danger" plain @click="removeZip(row.zipCode)">Del</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { deliveryZoneApi, type DeliveryZone } from '../../api/logistics';

const zones      = ref<DeliveryZone[]>([]);
const loading    = ref(false);
const submitting = ref(false);
const addingZip  = ref(false);
const newZip     = ref('');
const newZipNonServiceable = ref(false);

const dialog = ref<{ visible: boolean; isEdit: boolean; id: string | null }>({
  visible: false, isEdit: false, id: null,
});
const form = ref({ name: '', regionCode: '', isActive: true });
const zipDrawer = ref<{ visible: boolean; zone: DeliveryZone | null }>({ visible: false, zone: null });

async function load() {
  loading.value = true;
  try {
    const res = await deliveryZoneApi.list();
    zones.value = res.data.data;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  form.value = { name: '', regionCode: '', isActive: true };
  dialog.value = { visible: true, isEdit: false, id: null };
}
function openEdit(z: DeliveryZone) {
  form.value = { name: z.name, regionCode: z.regionCode, isActive: z.isActive };
  dialog.value = { visible: true, isEdit: true, id: z.id };
}
function openZoneDetail(z: DeliveryZone) {
  zipDrawer.value = { visible: true, zone: z };
  newZip.value = '';
  newZipNonServiceable.value = false;
}

async function submitZone() {
  submitting.value = true;
  try {
    if (dialog.value.isEdit && dialog.value.id) {
      await deliveryZoneApi.update(dialog.value.id, form.value);
      ElMessage.success('Zone updated');
    } else {
      await deliveryZoneApi.create({ name: form.value.name, regionCode: form.value.regionCode });
      ElMessage.success('Zone created');
    }
    dialog.value.visible = false;
    load();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Operation failed');
  } finally {
    submitting.value = false;
  }
}

async function addZip() {
  if (!zipDrawer.value.zone) return;
  addingZip.value = true;
  try {
    await deliveryZoneApi.addZip(zipDrawer.value.zone.id, {
      zipCode: newZip.value,
      isNonServiceable: newZipNonServiceable.value,
    });
    ElMessage.success('ZIP added');
    newZip.value = '';
    await load();
    zipDrawer.value.zone = zones.value.find((z) => z.id === zipDrawer.value.zone?.id) ?? null;
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to add ZIP');
  } finally {
    addingZip.value = false;
  }
}

async function removeZip(zipCode: string) {
  if (!zipDrawer.value.zone) return;
  try {
    await deliveryZoneApi.removeZip(zipDrawer.value.zone.id, zipCode);
    ElMessage.success('ZIP removed');
    await load();
    zipDrawer.value.zone = zones.value.find((z) => z.id === zipDrawer.value.zone?.id) ?? null;
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? 'Failed to remove ZIP');
  }
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.zip-add { display: flex; align-items: center; gap: 8px; }
</style>
