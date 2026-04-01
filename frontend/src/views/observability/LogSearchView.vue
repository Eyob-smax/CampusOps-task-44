<template>
  <div class="view-page">
    <div class="page-header">
      <h2>Log Search</h2>
    </div>

    <el-form :inline="true" class="filter-form">
      <el-form-item label="Severity">
        <el-select v-model="filters.severity" placeholder="All" clearable style="width:120px;">
          <el-option label="Error" value="error" />
          <el-option label="Warn" value="warn" />
          <el-option label="Info" value="info" />
          <el-option label="Debug" value="debug" />
        </el-select>
      </el-form-item>
      <el-form-item label="Service">
        <el-input v-model="filters.service" placeholder="service name" style="width:140px;" clearable />
      </el-form-item>
      <el-form-item label="Actor">
        <el-input v-model="filters.actor" placeholder="actor/user ID" style="width:140px;" clearable />
      </el-form-item>
      <el-form-item label="Domain">
        <el-input v-model="filters.domain" placeholder="e.g. parking" style="width:120px;" clearable />
      </el-form-item>
      <el-form-item label="Correlation ID">
        <el-input v-model="filters.correlationId" placeholder="correlation ID" style="width:200px;" clearable />
      </el-form-item>
      <el-form-item label="Full-text">
        <el-input v-model="filters.search" placeholder="search in message…" style="width:200px;" clearable />
      </el-form-item>
      <el-form-item label="From">
        <el-date-picker v-model="filters.from" type="datetime" style="width:180px;" />
      </el-form-item>
      <el-form-item label="To">
        <el-date-picker v-model="filters.to" type="datetime" style="width:180px;" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="search">Search</el-button>
        <el-button @click="resetFilters">Reset</el-button>
      </el-form-item>
    </el-form>

    <div class="results-header">
      <span class="total-label">{{ total }} results</span>
    </div>

    <el-table v-loading="loading" :data="logs" stripe size="small">
      <el-table-column label="Time" width="160">
        <template #default="{ row }">{{ new Date(row.timestamp).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="Level" width="80">
        <template #default="{ row }">
          <el-tag :type="levelTag(row.level)" size="small">{{ row.level }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Message" min-width="300" show-overflow-tooltip>
        <template #default="{ row }">{{ row.message || row.msg }}</template>
      </el-table-column>
      <el-table-column label="Correlation ID" width="220" show-overflow-tooltip>
        <template #default="{ row }">{{ row.correlationId ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="Detail" width="80">
        <template #default="{ row }">
          <el-button size="small" link @click="showDetail(row)">View</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination v-model:current-page="page" :page-size="limit" :total="total"
        layout="prev, pager, next, total" @current-change="search" />
    </div>

    <!-- Detail drawer -->
    <el-drawer v-model="drawer.visible" title="Log Entry Detail" size="560px">
      <pre class="log-json">{{ drawer.entry ? JSON.stringify(drawer.entry, null, 2) : '' }}</pre>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { logApi, type LogEntry } from '../../api/observability';

const logs    = ref<LogEntry[]>([]);
const loading = ref(false);
const total   = ref(0);
const page    = ref(1);
const limit   = 50;

const filters = ref({
  severity: '', service: '', actor: '', domain: '',
  correlationId: '', search: '', from: null as string | null, to: null as string | null,
});

const drawer = ref<{ visible: boolean; entry: LogEntry | null }>({ visible: false, entry: null });

async function search() {
  loading.value = true;
  try {
    const params: any = { page: page.value, limit };
    if (filters.value.severity)      params.severity      = filters.value.severity;
    if (filters.value.service)       params.service       = filters.value.service;
    if (filters.value.actor)         params.actor         = filters.value.actor;
    if (filters.value.domain)        params.domain        = filters.value.domain;
    if (filters.value.correlationId) params.correlationId = filters.value.correlationId;
    if (filters.value.search)        params.search        = filters.value.search;
    if (filters.value.from)          params.from          = new Date(filters.value.from as string).toISOString();
    if (filters.value.to)            params.to            = new Date(filters.value.to as string).toISOString();

    const res = await logApi.search(params);
    logs.value  = res.data.data.items;
    total.value = res.data.data.total;
  } finally {
    loading.value = false;
  }
}

onMounted(search);

function resetFilters() {
  filters.value = { severity: '', service: '', actor: '', domain: '', correlationId: '', search: '', from: null, to: null };
  page.value = 1;
  search();
}

function showDetail(entry: LogEntry) {
  drawer.value = { visible: true, entry };
}

function levelTag(level: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  const m: Record<string, '' | 'success' | 'warning' | 'danger' | 'info'> = {
    error: 'danger', warn: 'warning', info: '', debug: 'info',
  };
  return m[level] ?? 'info';
}
</script>

<style scoped>
.view-page { padding: 24px; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0; }
.filter-form { margin-bottom: 16px; }
.results-header { margin-bottom: 8px; }
.total-label { font-size: 13px; color: #606266; }
.pagination { margin-top: 16px; display: flex; justify-content: flex-end; }
.log-json { font-size: 12px; white-space: pre-wrap; word-break: break-all; background: #f5f7fa; padding: 12px; border-radius: 4px; }
</style>
