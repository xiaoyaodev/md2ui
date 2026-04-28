<template>
  <div class="container" :class="{ 'is-mobile': isMobile }">
    <!-- 移动端顶栏 -->
    <MobileHeader
      v-if="isMobile"
      @open-drawer="mobileDrawerOpen = true"
      @go-home="goHome"
      @open-search="openSearch"
    />
    <!-- 桌面端顶栏 -->
    <TopBar
      v-if="!isMobile"
      :editMode="editMode"
      :showWelcome="showWelcome"
      :docTitle="currentDocTitle"
      :rawMarkdown="rawMarkdown"
      @select-search="handleSearchSelect"
      @go-home="goHome"
      @toggle-edit="onToggleEdit"
    />
    <!-- 移动端遮罩 -->
    <transition name="fade">
      <div v-if="isMobile && mobileDrawerOpen" class="drawer-overlay" @click="mobileDrawerOpen = false"></div>
    </transition>
    <!-- 主体区域（侧边栏 + 内容 + TOC） -->
    <div class="main-body">
    <!-- 侧边栏 -->
    <AppSidebar
      v-if="!isMobile ? !sidebarCollapsed : true"
      :docsList="docsList"
      :currentDoc="currentDoc"
      :isMobile="isMobile"
      :drawerOpen="mobileDrawerOpen"
      :width="sidebarWidth"
      @go-home="goHome"
      @close-drawer="mobileDrawerOpen = false"
      @collapse="sidebarCollapsed = true"
      @expand-all="onExpandAll"
      @collapse-all="onCollapseAll"
      @toggle-folder="toggleFolder"
      @select-doc="handleDocSelect"
      @create-doc="createDoc"
      @delete-doc="deleteDoc"
      @rename-doc="({ item, newName }) => renameDoc(item, newName)"
      @reorder="reorderDocs"
    />
    <!-- 左侧拖拽条 & 展开按钮（桌面端） -->
    <div v-if="!isMobile && !sidebarCollapsed" class="resizer resizer-left" @mousedown="startResize('left', $event)"></div>
    <button v-if="!isMobile && sidebarCollapsed" class="expand-btn expand-btn-left" @click="sidebarCollapsed = false" title="展开导航">
      <ChevronRight :size="14" />
    </button>
    <!-- 内容区：查看模式 / 编辑模式 -->
    <DocContent
      v-if="!editMode"
      :showWelcome="showWelcome"
      :htmlContent="htmlContent"
      :prevDoc="prevDoc"
      :nextDoc="nextDoc"
      :docTitle="currentDocTitle"
      :lastModified="lastModified"
      @scroll="handleScroll"
      @content-click="onContentClick"
      @start="loadFirstDoc"
      @load-doc="loadDoc"
    />
    <EditorContentVue
      v-else
      :showWelcome="showWelcome"
      :markdownContent="rawMarkdown"
      :prevDoc="prevDoc"
      :nextDoc="nextDoc"
      :docTitle="currentDocTitle"
      :currentDocPath="currentDocFilePath"
      @scroll="handleScroll"
      @content-click="onContentClick"
      @start="loadFirstDoc"
      @load-doc="loadDoc"
      @save="onSaveDoc"
      @update:markdownContent="onEditorUpdate"
    />
    <!-- 桌面端 TOC -->
    <div v-if="!isMobile && !tocCollapsed && tocItems.length > 0" class="resizer resizer-right" @mousedown="startResize('right', $event)"></div>
    <TableOfContents v-if="!isMobile" :tocItems="tocItems" :activeHeading="activeHeading" :collapsed="tocCollapsed" :width="tocWidth" @toggle="tocCollapsed = !tocCollapsed" @scroll-to="(id) => scrollToHeading(id, { push: true })" />
    <button v-if="!isMobile && tocCollapsed && tocItems.length > 0" class="expand-btn expand-btn-right" @click="tocCollapsed = false" title="展开目录">
      <ChevronLeft :size="14" />
    </button>
    </div>
    <!-- 移动端 TOC -->
    <MobileToc
      v-if="isMobile"
      :tocItems="tocItems"
      :activeHeading="activeHeading"
      :open="mobileTocOpen"
      :showWelcome="showWelcome"
      @toggle="mobileTocOpen = !mobileTocOpen"
      @close="mobileTocOpen = false"
      @scroll-to="(id) => { scrollToHeading(id, { push: true }); mobileTocOpen = false }"
    />
    <!-- 返回顶部 -->
    <transition name="fade">
      <button v-if="showBackToTop" class="back-to-top" @click="scrollToTop" title="返回顶部">
        <ArrowUp :size="20" />
        <span class="progress-text">{{ scrollProgress }}%</span>
      </button>
    </transition>
    <!-- 图片放大 -->
    <ImageZoom :visible="zoomVisible" :images="zoomImages" :currentIndex="zoomIndex" @update:currentIndex="zoomIndex = $event" @close="zoomVisible = false" />

  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { ArrowUp, ChevronRight, ChevronLeft } from 'lucide-vue-next'
import MobileHeader from './components/MobileHeader.vue'
import TopBar from './components/TopBar.vue'
import AppSidebar from './components/AppSidebar.vue'
import DocContent from './components/DocContent.vue'
import EditorContentVue from './components/EditorContent.vue'
import TableOfContents from './components/TableOfContents.vue'
import MobileToc from './components/MobileToc.vue'
import ImageZoom from './components/ImageZoom.vue'
import { useDocManager } from './composables/useDocManager.js'
import { useResize } from './composables/useResize.js'
import { useFileWatcher } from './composables/useFileWatcher.js'
import { resetContentEtag } from './services/DocService.js'

import { useSearch } from './composables/useSearch.js'
import { useMobile } from './composables/useMobile.js'


// UI 状态（从 sessionStorage 恢复）
const sidebarCollapsed = ref(sessionStorage.getItem('sidebarCollapsed') === 'true')
const tocCollapsed = ref(sessionStorage.getItem('tocCollapsed') === 'true')
const zoomVisible = ref(false)
const zoomContent = ref('')
const zoomImages = ref([])
const zoomIndex = ref(0)

// composables
const {
  docsList, currentDoc, currentDocTitle, showWelcome, htmlContent, tocItems,
  editMode, rawMarkdown, currentDocFilePath, lastModified,
  scrollProgress, showBackToTop, activeHeading,
  handleScroll, scrollToHeading, scrollToTop,
  loadDocsList, loadFromUrl, goHome, loadDoc, loadFirstDoc,
  handleDocSelect, handleContentClick, handleSearchSelect,
  toggleEditMode, reloadDocsList, reloadCurrentDoc, saveDoc, getCurrentDocPath,
  toggleFolder, onExpandAll, onCollapseAll,
  prevDoc, nextDoc,
  createDoc, deleteDoc, renameDoc, reorderDocs
} = useDocManager()

const { sidebarWidth, tocWidth, startResize } = useResize()

const { openSearch } = useSearch()
const { isMobile, mobileDrawerOpen, mobileTocOpen } = useMobile()

// 文件监听（DocService 统一处理模式检测和 ETag）
useFileWatcher({
  getCurrentDocPath,
  onDocsListChange: (newTree) => reloadDocsList(newTree),
  onDocContentChange: (content) => reloadCurrentDoc(content)
})

// 切换编辑模式（基于锚点/标题文本保持阅读位置）
function onToggleEdit(isEdit) {
  const contentEl = document.querySelector('.content')
  let anchorId = ''
  let headingText = ''
  let scrollRatio = 0

  if (contentEl) {
    const headings = contentEl.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6')
    const contentRect = contentEl.getBoundingClientRect()
    const scrollTop = contentEl.scrollTop

    // 找到当前视口中最近的标题（最后一个已滚过顶部的）
    for (const heading of headings) {
      const rect = heading.getBoundingClientRect()
      const offsetFromTop = rect.top - contentRect.top
      if (offsetFromTop <= 80) {
        anchorId = heading.id || ''
        // 提取纯文本（去掉锚点图标等）
        const clone = heading.cloneNode(true)
        clone.querySelectorAll('.heading-anchor').forEach(a => a.remove())
        headingText = clone.textContent.trim()
      }
    }

    // 记录滚动比例作为兜底
    const scrollHeight = contentEl.scrollHeight - contentEl.clientHeight
    scrollRatio = scrollHeight > 0 ? scrollTop / scrollHeight : 0
  }

  editMode.value = isEdit
  sessionStorage.setItem('editMode', isEdit)

  nextTick(() => {
    const newContentEl = document.querySelector('.content')
    if (!newContentEl) return

    // 策略1：通过 id 定位（查看模式有 id）
    if (anchorId) {
      const target = document.getElementById(anchorId)
      if (target) {
        target.scrollIntoView({ block: 'start' })
        activeHeading.value = anchorId
        return
      }
    }

    // 策略2：通过标题文本匹配（编辑模式无 id，但文本一致）
    if (headingText) {
      const headings = newContentEl.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const heading of headings) {
        const clone = heading.cloneNode(true)
        clone.querySelectorAll('.heading-anchor').forEach(a => a.remove())
        if (clone.textContent.trim() === headingText) {
          heading.scrollIntoView({ block: 'start' })
          if (heading.id) activeHeading.value = heading.id
          return
        }
      }
    }

    // 策略3：按滚动比例恢复
    const scrollHeight = newContentEl.scrollHeight - newContentEl.clientHeight
    if (scrollHeight > 0) {
      newContentEl.scrollTop = scrollRatio * scrollHeight
    }
  })
}

// 编辑器内容更新
function onEditorUpdate(md) {
  rawMarkdown.value = md
}

// 保存文档
async function onSaveDoc({ path, content }) {
  const ok = await saveDoc({ path, content })
  if (ok) {
    resetContentEtag()
  }
}

// 内容区点击：委托给 docManager，图片放大回调在这里处理
function onContentClick(event) {
  handleContentClick(event, {
    onZoom({ images, index }) {
      zoomImages.value = images
      zoomIndex.value = index
      zoomVisible.value = true
    }
  })
}

// 全局快捷键
window.addEventListener('popstate', () => loadFromUrl())

// 持久化 UI 状态
watch(sidebarCollapsed, (v) => sessionStorage.setItem('sidebarCollapsed', v))
watch(tocCollapsed, (v) => sessionStorage.setItem('tocCollapsed', v))

onMounted(async () => {
  await loadDocsList()
  await loadFromUrl()
})
</script>
