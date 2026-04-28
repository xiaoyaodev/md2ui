<template>
  <div class="logo-container" @click="$emit('go-home')" title="返回首页">
    <svg class="logo-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
      <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="8" y1="16" x2="13" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span class="logo-text">md2ui</span>
  </div>
</template>

<script setup>
defineEmits(['go-home'])
</script>

<style scoped>
.logo-container {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text);
  cursor: pointer;
  transition: color 0.15s;
}

.logo-container:hover {
  color: var(--color-accent);
}

.logo-icon {
  flex-shrink: 0;
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
}
</style>
