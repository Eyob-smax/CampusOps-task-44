<template>
  <el-container class="app-shell">
    <!-- Sidebar -->
    <el-aside :width="collapsed ? '64px' : '240px'" class="sidebar">
      <div class="sidebar-logo">
        <span v-if="!collapsed" class="logo-text">CampusOps</span>
        <span v-else class="logo-icon">CO</span>
      </div>

      <el-menu
        :default-active="activeRoute"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        class="sidebar-menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataLine /></el-icon>
          <template #title>Dashboard</template>
        </el-menu-item>

        <el-sub-menu
          index="classroom"
          v-if="hasRole(['administrator', 'classroom_supervisor'])"
        >
          <template #title>
            <el-icon><Monitor /></el-icon>
            <span>Classroom</span>
          </template>
          <el-menu-item index="/classroom">Live Status</el-menu-item>
          <el-menu-item index="/classroom/anomalies"
            >Anomaly Queue</el-menu-item
          >
        </el-sub-menu>

        <el-sub-menu
          index="parking"
          v-if="
            hasRole([
              'administrator',
              'operations_manager',
              'classroom_supervisor',
            ])
          "
        >
          <template #title>
            <el-icon><Location /></el-icon>
            <span>Parking</span>
          </template>
          <el-menu-item index="/parking">Operations</el-menu-item>
          <el-menu-item
            index="/parking/supervisor-queue"
            v-if="hasRole(['administrator', 'classroom_supervisor'])"
          >
            Supervisor Queue
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="master-data">
          <template #title>
            <el-icon><Grid /></el-icon>
            <span>Master Data</span>
          </template>
          <el-menu-item index="/students">Students</el-menu-item>
          <el-menu-item index="/departments">Departments</el-menu-item>
          <el-menu-item index="/courses">Courses</el-menu-item>
          <el-menu-item index="/classes">Classes</el-menu-item>
          <el-menu-item index="/semesters">Semesters</el-menu-item>
        </el-sub-menu>

        <el-sub-menu
          index="logistics"
          v-if="hasRole(['administrator', 'operations_manager'])"
        >
          <template #title>
            <el-icon><Box /></el-icon>
            <span>Logistics</span>
          </template>
          <el-menu-item index="/warehouses">Warehouses</el-menu-item>
          <el-menu-item index="/carriers">Carriers</el-menu-item>
          <el-menu-item index="/delivery-zones">Delivery Zones</el-menu-item>
          <el-menu-item index="/shipping-templates"
            >Shipping Templates</el-menu-item
          >
        </el-sub-menu>

        <el-menu-item
          index="/fulfillment"
          v-if="hasRole(FULFILLMENT_READ_ROLES)"
        >
          <el-icon><ShoppingCart /></el-icon>
          <template #title>Fulfillment</template>
        </el-menu-item>

        <el-menu-item index="/shipments" v-if="hasRole(SHIPMENT_READ_ROLES)">
          <el-icon><Van /></el-icon>
          <template #title>Shipments</template>
        </el-menu-item>

        <el-menu-item
          index="/after-sales"
          v-if="hasRole(AFTER_SALES_READ_ROLES)"
        >
          <el-icon><Service /></el-icon>
          <template #title>After-Sales</template>
        </el-menu-item>

        <el-sub-menu
          index="membership"
          v-if="hasRole(['administrator', 'operations_manager'])"
        >
          <template #title>
            <el-icon><Medal /></el-icon>
            <span>Membership</span>
          </template>
          <el-menu-item index="/membership/tiers">Tiers</el-menu-item>
          <el-menu-item index="/membership/coupons">Coupons</el-menu-item>
          <el-menu-item index="/membership/stored-value"
            >Stored Value</el-menu-item
          >
        </el-sub-menu>

        <el-sub-menu index="admin" v-if="hasRole(['administrator', 'auditor'])">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>Admin</span>
          </template>
          <el-menu-item index="/admin/users" v-if="hasRole(['administrator'])"
            >Users</el-menu-item
          >
          <el-menu-item index="/admin/audit-log">Audit Log</el-menu-item>
          <el-menu-item
            index="/admin/jobs"
            v-if="hasRole(['administrator', 'operations_manager'])"
            >Job Monitor</el-menu-item
          >
          <el-menu-item index="/admin/metrics" v-if="hasRole(['administrator'])"
            >Metrics</el-menu-item
          >
          <el-menu-item index="/admin/logs" v-if="hasRole(['administrator'])"
            >Logs</el-menu-item
          >
          <el-menu-item
            index="/admin/settings"
            v-if="hasRole(['administrator'])"
            >Settings</el-menu-item
          >
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <!-- Main content -->
    <el-container>
      <el-header class="app-header">
        <el-icon class="collapse-btn" @click="collapsed = !collapsed">
          <Fold v-if="!collapsed" />
          <Expand v-else />
        </el-icon>

        <span class="header-title">{{ currentTitle }}</span>

        <div class="header-right">
          <el-dropdown @command="handleUserCommand">
            <span class="user-info">
              <el-icon><UserFilled /></el-icon>
              {{ auth.user?.username }} ({{ formatRole(auth.user?.role) }})
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">Sign Out</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  DataLine,
  Monitor,
  Location,
  Grid,
  Box,
  ShoppingCart,
  Van,
  Service,
  Medal,
  Setting,
  Fold,
  Expand,
  UserFilled,
  ArrowDown,
} from "@element-plus/icons-vue";
import { useAuthStore } from "@/stores/auth";
import type { UserRole } from "@/types";
import {
  FULFILLMENT_READ_ROLES,
  SHIPMENT_READ_ROLES,
  AFTER_SALES_READ_ROLES,
} from "@/router/access-policy";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const collapsed = ref(false);

const activeRoute = computed(() => route.path);
const currentTitle = computed(() => String(route.meta.title ?? "CampusOps"));

function hasRole(roles: UserRole[]): boolean {
  return auth.user ? roles.includes(auth.user.role) : false;
}

function formatRole(role?: string): string {
  return (
    role?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ?? ""
  );
}

function handleUserCommand(cmd: string) {
  if (cmd === "logout") {
    auth.logout();
    router.push("/login");
  }
}
</script>

<style scoped>
.app-shell {
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background: #061a2e;
  transition: width 0.25s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  border-bottom: 1px solid #173551;
  flex-shrink: 0;
}

.sidebar-menu {
  border-right: none;
  background: #061a2e;
  flex: 1;
  overflow-y: auto;
}

:deep(.el-menu--vertical .el-menu-item),
:deep(.el-menu--vertical .el-sub-menu__title) {
  color: #d7e4f2 !important;
}

:deep(.el-menu--vertical .el-menu-item:hover),
:deep(.el-menu--vertical .el-sub-menu__title:hover) {
  background-color: #11304a !important;
  color: #fff !important;
}

:deep(.el-menu--vertical .el-menu-item.is-active) {
  background-color: #1f6feb !important;
  color: #fff !important;
}

/* Keep submenu popups high-contrast when a section is expanded in compact/scroll states. */
:deep(.el-menu--popup) {
  background: #0b2238 !important;
  border: 1px solid #173551 !important;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35) !important;
}

:deep(.el-menu--popup .el-menu-item),
:deep(.el-menu--popup .el-sub-menu__title) {
  color: #deebf8 !important;
}

:deep(.el-menu--popup .el-menu-item:hover),
:deep(.el-menu--popup .el-sub-menu__title:hover) {
  background-color: #173a5a !important;
  color: #ffffff !important;
}

.app-header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  padding: 0 20px;
  gap: 16px;
  height: 60px;
}

.collapse-btn {
  cursor: pointer;
  font-size: 20px;
  color: #606266;
}
.header-title {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.header-right {
  margin-left: auto;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #606266;
  font-size: 14px;
}

.app-main {
  padding: 20px;
  overflow-y: auto;
  background: #f5f7fa;
}
</style>
