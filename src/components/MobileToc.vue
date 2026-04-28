<template>
  <!-- 浮动按钮 -->
  <button v-if="tocItems.length > 0 && !showWelcome" class="mobile-toc-fab" @click="$emit('toggle')" title="文档目录">
    <List :size="20" />
  </button>
  <!-- 弹出面板 -->
  <transition name="slide-up">
    <div v-if="open && tocItems.length > 0" class="mobile-toc-panel">
      <div class="mobile-toc-header">
        <span>目录</span>
        <button class="mobile-toc-close" @click="$emit('close')">
          <X :size="16" />
        </button>
      </div>
      <nav class="mobile-toc-nav">
        <a
          v-for="item in tocItems"
          :key="item.id"
          :class="['toc-item', `toc-level-${item.level}`, { active: activeHeading === item.id }]"
          @click.prevent="$emit('scroll-to', item.id)"
        >
          {{ item.text }}
        </a>
      </nav>
    </div>
  </transition>
</template>

<script setup>
import { List, X } from 'lucide-vue-next'

defineProps({
  tocItems: { type: Array, default: () => [] },
  activeHeading: { type: String, default: '' },
  open: { type: Boolean, default: false },
  showWelcome: { type: Boolean, default: true }
})

defineEmits(['toggle', 'close', 'scroll-to'])
</script>
