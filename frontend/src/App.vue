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
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  height: 100%;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', Arial, sans-serif;
}

.alert-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  padding: 0;
}

.alert-banner .el-alert {
  border-radius: 0;
  font-size: 14px;
}
</style>
