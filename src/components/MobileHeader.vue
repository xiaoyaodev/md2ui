<template>
  <header class="mobile-header">
    <button class="mobile-menu-btn" @click="$emit('open-drawer')" title="打开菜单">
      <Menu :size="20" />
    </button>
    <Logo @go-home="$emit('go-home')" />
    <div class="mobile-header-actions">
      <button class="mobile-action-btn" @click="$emit('open-search')" title="搜索">
        <Search :size="18" />
      </button>
    </div>
  </header>
</template>

<script setup>
import { Menu, Search } from 'lucide-vue-next'
import Logo from './Logo.vue'

defineEmits(['open-drawer', 'go-home', 'open-search'])
</script>
