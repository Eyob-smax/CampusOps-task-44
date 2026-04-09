<template>
  <el-config-provider :locale="enLocale">
    <!-- Global alert banner (WebSocket-driven) -->
    <div v-if="alertBannerVisible" class="alert-banner" role="alert">
      <el-alert
        :title="alertBannerMessage"
        type="error"
        :closable="true"
        show-icon
        @close="dismissAlertBanner"
      />
    </div>

    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { ElConfigProvider } from 'element-plus';
import en from 'element-plus/es/locale/lang/en';
import { useAuthStore } from '@/stores/auth';
import { connectAlertSocket, disconnectAlertSocket } from '@/composables/useAlertSocket';

const enLocale = en;
const alertBannerVisible = ref(false);
const alertBannerMessage = ref('');

function showAlertBanner(message: string) {
  alertBannerMessage.value = message;
  alertBannerVisible.value = true;
  // Play audible chime
  playAlertChime();
}

function dismissAlertBanner() {
  alertBannerVisible.value = false;
}

function playAlertChime() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);
  } catch {
    // Audio context may be blocked before user interaction — silently skip
  }
}

const auth = useAuthStore();
let stopSocketWatcher: (() => void) | null = null;

onMounted(async () => {
  await auth.ensureInitialized();

  stopSocketWatcher = watch(
    () => [auth.isAuthenticated, auth.accessToken] as const,
    ([isAuthenticated, token]) => {
      if (isAuthenticated && token) {
        connectAlertSocket(token, (msg) => showAlertBanner(msg));
        return;
      }
      disconnectAlertSocket();
    },
    { immediate: true },
  );
});

onUnmounted(() => {
  if (stopSocketWatcher) stopSocketWatcher();
  disconnectAlertSocket();
});
</script>

<style>
:root {
  --app-font: "Avenir Next", "Segoe UI Variable", "IBM Plex Sans", "Noto Sans", sans-serif;
  --app-bg-base: #f5f7f9;
  --app-bg-tint: #e6edf3;
  --app-bg-accent: #dbe5ec;
  --app-text: #1e2a33;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  height: 100%;
  font-family: var(--app-font);
  color: var(--app-text);
}

body {
  background:
    radial-gradient(circle at 0% 0%, var(--app-bg-accent) 0%, rgba(219, 229, 236, 0) 42%),
    radial-gradient(circle at 100% 100%, var(--app-bg-tint) 0%, rgba(230, 237, 243, 0) 38%),
    linear-gradient(180deg, var(--app-bg-base) 0%, #f2f5f8 100%);
}

.alert-banner {
  position: fixed;
  top: 10px;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 0 12px;
}

.alert-banner .el-alert {
  border-radius: 10px;
  max-width: 1280px;
  margin: 0 auto;
  font-size: 14px;
  border: 1px solid rgba(176, 42, 55, 0.2);
}
</style>
