<template>
  <aside
    class="sidebar"
    :class="{ 'sidebar-drawer': isMobile, 'drawer-open': drawerOpen }"
    :style="!isMobile ? { width: width + 'px' } : undefined"
  >
    <div class="sidebar-header">
      <Logo v-if="isMobile" @go-home="$emit('go-home')" />
      <div class="sidebar-header-actions">
        <button v-if="isMobile" class="sidebar-toggle" @click="$emit('close-drawer')" title="关闭菜单">
          <X :size="16" />
        </button>
        <button v-else class="sidebar-toggle" @click="$emit('collapse')" title="收起导航">
          <ChevronLeft :size="14" />
        </button>
      </div>
    </div>
    <nav class="nav-menu">
      <div class="nav-section">
        <span>文档目录</span>
        <div class="nav-actions">
          <button class="action-btn" @click="showCreateMenu($event, '')" title="新建">
            <Plus :size="14" />
          </button>
          <button class="action-btn" @click="$emit('expand-all')" title="全部展开">
            <ChevronsDownUp :size="14" />
          </button>
          <button class="action-btn" @click="$emit('collapse-all')" title="全部收起">
            <ChevronsUpDown :size="14" />
          </button>
        </div>
      </div>
      <div class="nav-filter">
        <Filter :size="12" class="nav-filter-icon" />
        <input v-model="filterText" type="text" class="nav-filter-input" placeholder="过滤文档..." />
        <button v-if="filterText" class="nav-filter-clear" @click="filterText = ''">
          <X :size="12" />
        </button>
      </div>
      <!-- 无过滤时使用拖拽排序 -->
      <draggable
        v-if="!filterText"
        :list="docsList"
        :group="{ name: 'doc-tree', pull: true, put: true }"
        item-key="key"
        :animation="200"
        ghost-class="drag-ghost"
        chosen-class="drag-chosen"
        drag-class="drag-active"
        handle=".nav-item"
        :fallback-on-body="true"
        :swap-threshold="0.65"
        @end="onDragEnd"
      >
        <template #item="{ element }">
          <TreeNode
            :item="element"
            :currentDoc="currentDoc"
            @toggle="$emit('toggle-folder', $event)"
            @select="$emit('select-doc', $event)"
            @show-create="showCreateMenu"
            @rename="(payload) => $emit('rename-doc', payload)"
            @delete="(payload) => $emit('delete-doc', payload)"
            @drag-end="onDragEnd"
          />
        </template>
      </draggable>
      <!-- 过滤模式下禁用拖拽 -->
      <template v-else>
        <TreeNode
          v-for="item in filteredDocs"
          :key="item.key"
          :item="item"
          :currentDoc="currentDoc"
          @toggle="$emit('toggle-folder', $event)"
          @select="$emit('select-doc', $event)"
          @show-create="showCreateMenu"
          @rename="(payload) => $emit('rename-doc', payload)"
          @delete="(payload) => $emit('delete-doc', payload)"
        />
      </template>
      <div v-if="filterText && filteredDocs.length === 0" class="nav-filter-empty">
        没有匹配的文档
      </div>
    </nav>

    <!-- 新建菜单 -->
    <Teleport to="body">
      <div v-if="createMenuVisible" class="ctx-menu-overlay" @click="createMenuVisible = false">
        <div class="ctx-menu" :style="createMenuStyle" @click.stop>
          <div class="ctx-menu-item" @click="startCreate('file')">
            <FileText :size="14" />
            <span>新建文档</span>
          </div>
          <div class="ctx-menu-item" @click="startCreate('folder')">
            <FolderPlus :size="14" />
            <span>新建目录</span>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 新建输入弹窗 -->
    <Teleport to="body">
      <div v-if="createInputVisible" class="modal-overlay" @click="createInputVisible = false">
        <div class="modal-dialog" @click.stop>
          <div class="modal-title">{{ createType === 'file' ? '新建文档' : '新建目录' }}</div>
          <input
            ref="createInputRef"
            v-model="createName"
            class="modal-input"
            :placeholder="createType === 'file' ? '请输入文档名称' : '请输入目录名称'"
            @keydown.enter="confirmCreate"
            @keydown.escape="createInputVisible = false"
          />
          <div v-if="createError" class="modal-error">{{ createError }}</div>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" @click="createInputVisible = false">取消</button>
            <button class="modal-btn modal-btn-confirm" @click="confirmCreate">确定</button>
          </div>
        </div>
      </div>
    </Teleport>


  </aside>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { ChevronLeft, X, ChevronsDownUp, ChevronsUpDown, Filter, Plus, FileText, FolderPlus } from 'lucide-vue-next'
import draggable from 'vuedraggable'
import Logo from './Logo.vue'
import TreeNode from './TreeNode.vue'

const props = defineProps({
  docsList: { type: Array, default: () => [] },
  currentDoc: { type: String, default: '' },
  isMobile: { type: Boolean, default: false },
  drawerOpen: { type: Boolean, default: false },
  width: { type: Number, default: 320 }
})

const emit = defineEmits([
  'go-home', 'close-drawer', 'collapse',
  'expand-all', 'collapse-all',
  'toggle-folder', 'select-doc',
  'create-doc', 'delete-doc', 'rename-doc',
  'reorder'
])

const filterText = ref('')

function filterTree(items, keyword) {
  if (!keyword) return items
  const lower = keyword.toLowerCase()
  const result = []
  for (const item of items) {
    if (item.type === 'file') {
      if (item.label.toLowerCase().includes(lower) || item.key.toLowerCase().includes(lower)) {
        result.push(item)
      }
    } else if (item.type === 'folder' && item.children) {
      const children = filterTree(item.children, keyword)
      if (children.length > 0) {
        result.push({ ...item, children, expanded: true })
      }
    }
  }
  return result
}

const filteredDocs = computed(() => filterTree(props.docsList, filterText.value))

// 当前文档变化时，自动滚动菜单到选中项
watch(() => props.currentDoc, (newDoc) => {
  if (!newDoc) return
  nextTick(() => {
    const activeEl = document.querySelector('.nav-menu .nav-item.active')
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
})

// ===== 新建菜单 =====
const createMenuVisible = ref(false)
const createMenuStyle = ref({})
const createParentKey = ref('')

function showCreateMenu(event, parentKey) {
  createParentKey.value = parentKey
  const rect = event.currentTarget.getBoundingClientRect()
  // 先以不可见状态渲染，等测量后再修正位置
  createMenuStyle.value = {
    position: 'fixed',
    left: `${rect.right + 4}px`,
    top: `${rect.top}px`,
    zIndex: 9999,
    visibility: 'hidden'
  }
  createMenuVisible.value = true
  nextTick(() => {
    const menuEl = document.querySelector('.ctx-menu')
    if (menuEl) {
      const menuRect = menuEl.getBoundingClientRect()
      let left = rect.right + 4
      let top = rect.top
      // 右侧溢出修正
      if (left + menuRect.width > window.innerWidth - 10) {
        left = rect.left - menuRect.width - 4
      }
      // 底部溢出修正：向上弹出，使菜单底部对齐触发按钮底部
      if (top + menuRect.height > window.innerHeight - 10) {
        top = rect.bottom - menuRect.height
      }
      // 如果向上修正后超出顶部，则贴顶
      if (top < 10) {
        top = 10
      }
      createMenuStyle.value = {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
        visibility: 'visible'
      }
    }
  })
}

// ===== 新建输入 =====
const createInputVisible = ref(false)
const createInputRef = ref(null)
const createType = ref('file')
const createName = ref('')
const createError = ref('')

function startCreate(type) {
  createMenuVisible.value = false
  createType.value = type
  createName.value = ''
  createError.value = ''
  createInputVisible.value = true
  nextTick(() => createInputRef.value?.focus())
}

function confirmCreate() {
  const name = createName.value.trim()
  if (!name) { createError.value = '名称不能为空'; return }
  if (/[\\/:*?"<>|]/.test(name)) { createError.value = '名称包含非法字符'; return }
  createError.value = ''
  emit('create-doc', { parentKey: createParentKey.value, name, type: createType.value })
  createInputVisible.value = false
}

// ===== 拖拽排序 =====
function onDragEnd() {
  // 拖拽结束后，通知父组件执行重编号
  emit('reorder')
}
</script>
