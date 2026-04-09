<template>
  <div class="view-page">
    <h2>Stored Value</h2>

    <!-- Student Lookup -->
    <el-card class="lookup-card" shadow="never">
      <el-form inline @submit.prevent="lookupStudent">
        <el-form-item label="Student ID">
          <el-input
            v-model="studentId"
            placeholder="Enter student ID"
            clearable
            style="width: 260px"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="lookupLoading"
            :disabled="!studentId.trim()"
            @click="lookupStudent"
          >
            Look Up
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Balance Card -->
    <el-card v-if="balanceLoaded" class="balance-card" shadow="never">
      <div class="balance-display">
        <span class="balance-label">Current Balance</span>
        <span class="balance-amount">${{ balance.toFixed(2) }}</span>
      </div>
      <div class="action-buttons">
        <el-button type="success" @click="openTopUp">Top Up</el-button>
        <el-button type="warning" @click="openSpend">Spend</el-button>
      </div>
    </el-card>

    <!-- Transaction History -->
    <el-card v-if="balanceLoaded" shadow="never" style="margin-top: 20px">
      <template #header>
        <span>Transaction History</span>
      </template>

      <el-table v-loading="txLoading" :data="transactions" stripe>
        <el-table-column label="Date" width="170">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="Type" width="110">
          <template #default="{ row }">
            <el-tag :type="typeTagColor(row.type)" size="small">
              {{ typeLabel(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Amount" width="120">
          <template #default="{ row }">
            {{ formatAmountCell(row.amount, row.amountEncrypted) }}
          </template>
        </el-table-column>
        <el-table-column label="Balance After" width="130">
          <template #default="{ row }">
            {{ formatAmountCell(row.balanceAfter, row.balanceAfterEncrypted) }}
          </template>
        </el-table-column>
        <el-table-column label="Note / Reference" min-width="180">
          <template #default="{ row }">
            {{ row.note || row.referenceId || "—" }}
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              type="primary"
              @click="openReceipt(row.id)"
            >
              Receipt
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-if="!txLoading && transactions.length === 0"
        description="No transactions found"
      />

      <div v-if="txTotal > txLimit" class="pagination-row">
        <el-pagination
          v-model:current-page="txPage"
          :page-size="txLimit"
          :total="txTotal"
          layout="prev, pager, next"
          @current-change="loadTransactions"
        />
      </div>
    </el-card>

    <!-- Top Up Dialog -->
    <el-dialog v-model="topUpDialog" title="Top Up Balance" width="420px">
      <el-form :model="topUpForm" label-width="80px">
        <el-form-item label="Amount" required>
          <el-input-number
            v-model="topUpForm.amount"
            :min="0.01"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Note">
          <el-input v-model="topUpForm.note" placeholder="Optional note" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="topUpDialog = false">Cancel</el-button>
        <el-button
          type="primary"
          :loading="actionLoading"
          :disabled="!topUpForm.amount || topUpForm.amount <= 0"
          @click="submitTopUp"
        >
          Confirm Top Up
        </el-button>
      </template>
    </el-dialog>

    <!-- Spend Dialog -->
    <el-dialog v-model="spendDialog" title="Spend from Balance" width="420px">
      <el-form :model="spendForm" label-width="110px">
        <el-form-item label="Amount" required>
          <el-input-number
            v-model="spendForm.amount"
            :min="0.01"
            :precision="2"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Reference ID" required>
          <el-input
            v-model="spendForm.referenceId"
            placeholder="e.g. order ID or invoice number"
          />
        </el-form-item>
        <el-form-item label="Reference Type" required>
          <el-input
            v-model="spendForm.referenceType"
            placeholder="e.g. order, fee, purchase"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="spendDialog = false">Cancel</el-button>
        <el-button
          type="primary"
          :loading="actionLoading"
          :disabled="
            !spendForm.amount ||
            spendForm.amount <= 0 ||
            !spendForm.referenceId.trim() ||
            !spendForm.referenceType.trim()
          "
          @click="submitSpend"
        >
          Confirm Spend
        </el-button>
      </template>
    </el-dialog>

    <!-- Receipt Dialog -->
    <el-dialog
      v-model="receiptDialog"
      title="Transaction Receipt"
      width="520px"
    >
      <div v-loading="receiptLoading">
        <pre
          v-if="receiptContent"
          id="printable-receipt"
          class="receipt-content receipt-pre"
        >{{ receiptContent }}</pre>
        <el-empty
          v-else-if="!receiptLoading"
          description="Receipt not available"
        />
      </div>
      <template #footer>
        <el-button @click="receiptDialog = false">Close</el-button>
        <el-button
          type="primary"
          :disabled="!receiptContent"
          @click="printReceipt"
          >Print</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import dayjs from "dayjs";
import {
  storedValueApi,
  type StoredValueTransaction,
} from "../../api/membership";

// --- Student Lookup ---
const studentId = ref("");
const lookupLoading = ref(false);
const balanceLoaded = ref(false);
const balance = ref(0);

async function lookupStudent() {
  const id = studentId.value.trim();
  if (!id) return;
  lookupLoading.value = true;
  balanceLoaded.value = false;
  try {
    const res = await storedValueApi.getBalance(id);
    const payload = (res.data as any).data ?? res.data;
    balance.value = payload.balance;
    balanceLoaded.value = true;
    txPage.value = 1;
    await loadTransactions();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? "Failed to look up student");
  } finally {
    lookupLoading.value = false;
  }
}

// --- Transactions ---
const transactions = ref<StoredValueTransaction[]>([]);
const txLoading = ref(false);
const txPage = ref(1);
const txLimit = 10;
const txTotal = ref(0);

async function loadTransactions() {
  const id = studentId.value.trim();
  if (!id) return;
  txLoading.value = true;
  try {
    const res = await storedValueApi.listTransactions(id, {
      page: txPage.value,
      limit: txLimit,
    });
    const payload = (res.data as any).data ?? res.data;
    transactions.value = payload.items;
    txTotal.value = payload.total;
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? "Failed to load transactions");
  } finally {
    txLoading.value = false;
  }
}

// --- Top Up ---
const topUpDialog = ref(false);
const topUpForm = ref({ amount: 0, note: "" });
const actionLoading = ref(false);

function openTopUp() {
  topUpForm.value = { amount: 0, note: "" };
  topUpDialog.value = true;
}

async function submitTopUp() {
  actionLoading.value = true;
  try {
    const payload: { amount: number; note?: string } = {
      amount: topUpForm.value.amount,
    };
    if (topUpForm.value.note.trim()) {
      payload.note = topUpForm.value.note.trim();
    }
    const res = await storedValueApi.topUp(studentId.value.trim(), payload);
    const result = (res.data as any).data ?? res.data;
    balance.value = result.balance;
    ElMessage.success("Top up successful");
    topUpDialog.value = false;
    await loadTransactions();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? "Top up failed");
  } finally {
    actionLoading.value = false;
  }
}

// --- Spend ---
const spendDialog = ref(false);
const spendForm = ref({ amount: 0, referenceId: "", referenceType: "" });

function openSpend() {
  spendForm.value = { amount: 0, referenceId: "", referenceType: "" };
  spendDialog.value = true;
}

async function submitSpend() {
  actionLoading.value = true;
  try {
    const res = await storedValueApi.spend(studentId.value.trim(), {
      amount: spendForm.value.amount,
      referenceId: spendForm.value.referenceId.trim(),
      referenceType: spendForm.value.referenceType.trim(),
    });
    const result = (res.data as any).data ?? res.data;
    balance.value = result.balance;
    ElMessage.success("Spend recorded");
    spendDialog.value = false;
    await loadTransactions();
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? "Spend failed");
  } finally {
    actionLoading.value = false;
  }
}

// --- Receipt ---
const receiptDialog = ref(false);
const receiptLoading = ref(false);
const receiptContent = ref("");

async function openReceipt(transactionId: string) {
  receiptContent.value = "";
  receiptDialog.value = true;
  receiptLoading.value = true;
  try {
    const res = await storedValueApi.getReceipt(transactionId);
    const payload = (res.data as any).data ?? res.data;
    receiptContent.value = typeof payload === "string" ? payload : "";
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error ?? "Failed to load receipt");
  } finally {
    receiptLoading.value = false;
  }
}

function printReceipt() {
  window.print();
}

// --- Helpers ---
function formatDate(dateStr: string): string {
  return dayjs(dateStr).format("YYYY-MM-DD HH:mm");
}

function typeTagColor(type: string): "" | "success" | "warning" | "danger" {
  switch (type) {
    case "top_up":
      return "success";
    case "spend":
      return "warning";
    case "refund":
      return "danger";
    default:
      return "";
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "top_up":
      return "Top Up";
    case "spend":
      return "Spend";
    case "refund":
      return "Refund";
    default:
      return type;
  }
}

function formatAmountCell(
  displayAmount?: number,
  encryptedAmount?: string,
): string {
  if (typeof displayAmount === "number" && Number.isFinite(displayAmount)) {
    return `$${displayAmount.toFixed(2)}`;
  }

  const fallback = Number(encryptedAmount);
  if (Number.isFinite(fallback)) {
    return `$${fallback.toFixed(2)}`;
  }

  return "—";
}
</script>

<style scoped>
.view-page {
  padding: 24px;
}

.lookup-card {
  margin-bottom: 20px;
}

.balance-card {
  margin-bottom: 0;
}

.balance-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 16px;
}

.balance-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 4px;
}

.balance-amount {
  font-size: 36px;
  font-weight: 700;
  color: #409eff;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.pagination-row {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.receipt-content {
  padding: 16px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fff;
  min-height: 120px;
}

.receipt-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: Consolas, "Courier New", monospace;
}
</style>

<style>
@media print {
  body * {
    visibility: hidden !important;
  }
  #printable-receipt,
  #printable-receipt * {
    visibility: visible !important;
  }
  #printable-receipt {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
</style>
