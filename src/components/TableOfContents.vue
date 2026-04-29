<template>
  <aside class="toc-sidebar" v-if="tocItems.length > 0 && !collapsed" :style="{ width: width + 'px' }">
    <div class="toc-header">
      <div class="toc-title">
        <List :size="16" />
        <span>目录</span>
      </div>
      <div class="toc-header-actions">
        <button class="toc-action-btn" @click="expandAll" title="全部展开">
          <ChevronsDownUp :size="14" />
        </button>
        <button class="toc-action-btn" @click="collapseAll" title="全部收起">
          <ChevronsUpDown :size="14" />
        </button>
        <button class="toc-toggle" @click="$emit('toggle')" title="收起目录">
          <ChevronRight :size="14" />
        </button>
      </div>
    </div>
    <nav ref="tocNavRef" class="toc-nav">
      <!-- 左侧连续竖线 -->
      <div class="toc-track"></div>
      <!-- marker 滑块（平滑过渡） -->
      <div class="toc-marker" :style="markerStyle"></div>
      <template v-for="(item, index) in tocItems" :key="item.id">
        <!-- 顶级标题（h1/h2）：可点击折叠 -->
        <a
          v-if="isTopLevel(item)"
          :href="`#${item.id}`"
          :data-toc-id="item.id"
          :class="['toc-item', `toc-level-${item.level}`, { active: activeHeading === item.id }]"
          @click.prevent="$emit('scroll-to', item.id)"
        >
          <span class="toc-item-text">{{ item.text }}</span>
          <button
            v-if="hasChildren(index)"
            class="toc-fold-btn"
            @click.prevent.stop="toggleSection(item.id)"
            :title="collapsedSections.has(item.id) ? '展开子目录' : '收起子目录'"
          >
            <ChevronRight :size="12" :class="{ 'toc-fold-icon-open': !collapsedSections.has(item.id) }" class="toc-fold-icon" />
          </button>
        </a>
        <!-- 子标题（h3/h4）：受父级折叠控制 -->
        <a
          v-else-if="!isSectionCollapsed(index)"
          :href="`#${item.id}`"
          :data-toc-id="item.id"
          :class="['toc-item', `toc-level-${item.level}`, { active: activeHeading === item.id }]"
          @click.prevent="$emit('scroll-to', item.id)"
        >
          {{ item.text }}
        </a>
      </template>
    </nav>
  </aside>
</template>

<script setup>
import { ref, watch, nextTick, reactive } from 'vue'
import { List, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-vue-next'

const props = defineProps({
  tocItems: { type: Array, default: () => [] },
  activeHeading: { type: String, default: '' },
  collapsed: { type: Boolean, default: false },
  width: { type: Number, default: 240 }
})

defineEmits(['scroll-to', 'toggle'])

// 目录导航容器 ref
const tocNavRef = ref(null)

// marker 滑块位置
const markerStyle = reactive({ top: '0px', height: '0px', opacity: 0 })

// 记录被收起的顶级标题 id
const collapsedSections = ref(new Set())

// 判断是否为顶级标题（h1 或 h2）
function isTopLevel(item) {
  return item.level <= 2
}

// 判断某个顶级标题后面是否有子标题
function hasChildren(index) {
  const next = props.tocItems[index + 1]
  return next && next.level > props.tocItems[index].level
}

// 找到某个子标题对应的父级顶级标题
function findParentId(index) {
  for (let i = index - 1; i >= 0; i--) {
    if (isTopLevel(props.tocItems[i])) {
      return props.tocItems[i].id
    }
  }
  return null
}

// 判断某个子标题是否被折叠
function isSectionCollapsed(index) {
  const parentId = findParentId(index)
  return parentId ? collapsedSections.value.has(parentId) : false
}

// 切换某个顶级标题的折叠状态
function toggleSection(id) {
  const next = new Set(collapsedSections.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  collapsedSections.value = next
}

// 全部展开
function expandAll() {
  collapsedSections.value = new Set()
}

// 全部收起
function collapseAll() {
  const ids = new Set()
  props.tocItems.forEach((item, index) => {
    if (isTopLevel(item) && hasChildren(index)) {
      ids.add(item.id)
    }
  })
  collapsedSections.value = ids
}

// 更新 marker 滑块位置
function updateMarker() {
  if (!props.activeHeading || !tocNavRef.value) {
    markerStyle.opacity = 0
    return
  }
  const el = tocNavRef.value.querySelector(`[data-toc-id="${props.activeHeading}"]`)
  if (!el) {
    markerStyle.opacity = 0
    return
  }
  const navRect = tocNavRef.value.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  markerStyle.top = `${elRect.top - navRect.top + tocNavRef.value.scrollTop}px`
  markerStyle.height = `${elRect.height}px`
  markerStyle.opacity = 1
}

// 滚动时自动展开当前激活标题所在的折叠分组，并将目录项滚动到可视区域
watch(() => props.activeHeading, (id) => {
  if (!id) {
    markerStyle.opacity = 0
    return
  }
  const index = props.tocItems.findIndex(item => item.id === id)
  if (index === -1) return
  // 如果激活的是子标题，找到其父级并展开
  if (!isTopLevel(props.tocItems[index])) {
    const parentId = findParentId(index)
    if (parentId && collapsedSections.value.has(parentId)) {
      const next = new Set(collapsedSections.value)
      next.delete(parentId)
      collapsedSections.value = next
    }
  }
  // 等 DOM 更新后，将激活项滚动到目录可视区域，并更新 marker
  nextTick(() => {
    const el = tocNavRef.value?.querySelector(`[data-toc-id="${id}"]`)
    if (el && tocNavRef.value) {
      // 只在 TOC 导航容器内滚动，避免 scrollIntoView 冒泡影响主内容区导致抖动
      const navRect = tocNavRef.value.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const elCenter = elRect.top + elRect.height / 2
      const navCenter = navRect.top + navRect.height / 2
      const offset = elCenter - navCenter
      tocNavRef.value.scrollBy({ top: offset, behavior: 'smooth' })
    }
    updateMarker()
  })
})

// 文档切换时重置折叠状态和 marker
watch(() => props.tocItems, () => {
  collapsedSections.value = new Set()
  markerStyle.opacity = 0
})
</script>
