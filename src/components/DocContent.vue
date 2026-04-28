<template>
  <main class="content" @scroll="$emit('scroll', $event)" @click="$emit('content-click', $event)">
    <WelcomePage v-if="showWelcome" @start="$emit('start')" />
    <template v-else>
      <article class="markdown-content" v-html="htmlContent"></article>
      <!-- 最后更新时间 -->
      <div v-if="lastModifiedText" class="doc-last-modified">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>最后更新于 {{ lastModifiedText }}</span>
      </div>
      <nav v-if="prevDoc || nextDoc" class="doc-nav">
        <a v-if="prevDoc" class="doc-nav-link prev" @click.prevent="$emit('load-doc', prevDoc.key)">
          <ChevronLeft :size="16" />
          <div class="doc-nav-text">
            <span class="doc-nav-label">上一篇</span>
            <span class="doc-nav-title">{{ prevDoc.label }}</span>
          </div>
        </a>
        <div v-else></div>
        <a v-if="nextDoc" class="doc-nav-link next" @click.prevent="$emit('load-doc', nextDoc.key)">
          <div class="doc-nav-text">
            <span class="doc-nav-label">下一篇</span>
            <span class="doc-nav-title">{{ nextDoc.label }}</span>
          </div>
          <ChevronRight :size="16" />
        </a>
      </nav>
    </template>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import WelcomePage from './WelcomePage.vue'

const props = defineProps({
  showWelcome: { type: Boolean, default: true },
  htmlContent: { type: String, default: '' },
  prevDoc: { type: Object, default: null },
  nextDoc: { type: Object, default: null },
  docTitle: { type: String, default: '文档' },
  lastModified: { type: String, default: '' },
})

defineEmits(['scroll', 'content-click', 'start', 'load-doc'])

// 格式化最后修改时间
const lastModifiedText = computed(() => {
  if (!props.lastModified) return ''
  try {
    const date = new Date(props.lastModified)
    if (isNaN(date.getTime())) return ''
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  } catch {
    return ''
  }
})
</script>
