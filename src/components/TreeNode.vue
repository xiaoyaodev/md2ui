<template>
  <div class="tree-node-root">
    <!-- 文件夹节点 -->
    <div 
      v-if="item.type === 'folder'"
      class="nav-item nav-folder"
      :class="{ expanded: item.expanded, 'drag-over': isDragOver }"
      :style="{ paddingLeft: `${20 + item.level * 16}px` }"
      @click="$emit('toggle', item)"
      @mouseenter="onMouseEnter($event, item.label)"
      @mouseleave="onMouseLeave"
      @dragover.prevent="onFolderDragOver"
      @dragleave="onFolderDragLeave"
      @drop.prevent="onFolderDrop"
    >
      <ChevronRight v-if="!item.expanded" class="nav-icon chevron-icon" :size="16" />
      <ChevronDown v-else class="nav-icon chevron-icon" :size="16" />
      <Folder v-if="!item.expanded" class="nav-icon folder-icon" :size="16" />
      <FolderOpen v-else class="nav-icon folder-icon" :size="16" />
      <span class="nav-label">{{ item.label }}</span>
      <span class="nav-item-actions" @click.stop>
        <button class="nav-item-btn" @click="$emit('show-create', $event, item.key)" title="新建">
          <Plus :size="12" />
        </button>
        <button class="nav-item-btn" @click="startRename($event)" title="重命名">
          <Pencil :size="12" />
        </button>
        <button class="nav-item-btn nav-item-btn-danger" @click="startDelete($event)" title="删除">
          <Trash2 :size="12" />
        </button>
      </span>
    </div>
    
    <!-- 递归渲染子节点（可拖拽排序） -->
    <draggable
      v-if="item.type === 'folder' && item.expanded && item.children"
      :list="item.children"
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
          @toggle="$emit('toggle', $event)"
          @select="$emit('select', $event)"
          @show-create="(e, k) => $emit('show-create', e, k)"
          @rename="(payload) => $emit('rename', payload)"
          @delete="(payload) => $emit('delete', payload)"
          @drag-end="$emit('drag-end', $event)"
        />
      </template>
    </draggable>
    
    <!-- 文件节点 -->
    <div 
      v-if="item.type === 'file'"
      class="nav-item"
      :class="{ active: currentDoc === item.key }"
      :style="{ paddingLeft: `${20 + item.level * 16}px` }"
      @click="$emit('select', item.key)"
      @mouseenter="onMouseEnter($event, item.label)"
      @mouseleave="onMouseLeave"
    >
      <FileText class="nav-icon file-icon" :size="16" />
      <span class="nav-label">{{ item.label }}</span>
      <span class="nav-item-actions" @click.stop>
        <button class="nav-item-btn" @click="startRename($event)" title="重命名">
          <Pencil :size="12" />
        </button>
        <button class="nav-item-btn nav-item-btn-danger" @click="startDelete($event)" title="删除">
          <Trash2 :size="12" />
        </button>
      </span>
    </div>

    <!-- 重命名气泡 -->
    <Teleport to="body">
      <div v-if="renameVisible" class="popover-overlay" @click="cancelRename">
        <div class="popover-bubble" :style="popoverStyle" @click.stop>
          <input
            ref="renameInputRef"
            v-model="renameName"
            class="popover-input"
            placeholder="请输入新名称"
            @keydown.enter="confirmRename"
            @keydown.escape="cancelRename"
          />
          <div v-if="renameError" class="popover-error">{{ renameError }}</div>
          <div class="popover-actions">
            <button class="popover-btn popover-btn-cancel" @click="cancelRename">取消</button>
            <button class="popover-btn popover-btn-confirm" @click="confirmRename">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认气泡 -->
    <Teleport to="body">
      <div v-if="deleteVisible" class="popover-overlay" @click="deleteVisible = false">
        <div class="popover-bubble" :style="popoverStyle" @click.stop>
          <div class="popover-message">
            确定删除「<strong>{{ item.label }}</strong>」？
            <template v-if="item.type === 'folder'">
              <br /><span class="popover-warning">目录下所有内容将一并删除</span>
            </template>
          </div>
          <div class="popover-actions">
            <button class="popover-btn popover-btn-cancel" @click="deleteVisible = false">取消</button>
            <button class="popover-btn popover-btn-danger" @click="confirmDelete">删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import draggable from 'vuedraggable'
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Plus, Pencil, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  item: { type: Object, required: true },
  currentDoc: { type: String, required: true }
})

const emit = defineEmits(['toggle', 'select', 'show-create', 'rename', 'delete', 'drag-end'])

// ===== 拖拽相关 =====
const isDragOver = ref(false)
let dragOverTimer = null

function onFolderDragOver() {
  isDragOver.value = true
  clearTimeout(dragOverTimer)
}

function onFolderDragLeave() {
  dragOverTimer = setTimeout(() => { isDragOver.value = false }, 100)
}

function onFolderDrop() {
  isDragOver.value = false
}

function onDragEnd(evt) {
  emit('drag-end', evt)
}

// ===== 气泡定位 =====
const popoverStyle = ref({})
const bubbleRef = ref(null)

// 记录触发按钮的位置
let triggerRect = null

function calcPopoverPos(event) {
  const btn = event.currentTarget
  triggerRect = btn.getBoundingClientRect()
  // 先设置一个不可见的初始位置，等渲染后再修正
  popoverStyle.value = {
    position: 'fixed',
    left: `${Math.max(8, triggerRect.left - 80)}px`,
    top: '0px',
    zIndex: 9999,
    visibility: 'hidden'
  }
}

function adjustPopoverPos() {
  nextTick(() => {
    const bubble = document.querySelector('.popover-bubble')
    if (!bubble || !triggerRect) return
    const bRect = bubble.getBoundingClientRect()
    let left = Math.max(8, triggerRect.left - 80)
    // 默认向上弹出
    let top = triggerRect.top - bRect.height - 6
    // 上方空间不够，改为向下
    if (top < 10) {
      top = triggerRect.bottom + 6
    }
    // 向下弹出后底部仍然溢出，贴底显示
    if (top + bRect.height > window.innerHeight - 10) {
      top = window.innerHeight - bRect.height - 10
    }
    // 右侧溢出修正
    if (left + bRect.width > window.innerWidth - 10) {
      left = window.innerWidth - bRect.width - 10
    }
    popoverStyle.value = {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      zIndex: 9999,
      visibility: 'visible'
    }
  })
}

// ===== 重命名 =====
const renameVisible = ref(false)
const renameInputRef = ref(null)
const renameName = ref('')
const renameError = ref('')

function startRename(event) {
  deleteVisible.value = false
  renameName.value = props.item.label
  renameError.value = ''
  calcPopoverPos(event)
  renameVisible.value = true
  nextTick(() => {
    adjustPopoverPos()
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function confirmRename() {
  const newName = renameName.value.trim()
  if (!newName) { renameError.value = '名称不能为空'; return }
  if (/[\\/:*?"<>|]/.test(newName)) { renameError.value = '名称包含非法字符'; return }
  if (newName === props.item.label) { renameVisible.value = false; return }
  renameError.value = ''
  emit('rename', { item: props.item, newName })
  renameVisible.value = false
}

function cancelRename() {
  renameVisible.value = false
}

// ===== 删除 =====
const deleteVisible = ref(false)

function startDelete(event) {
  renameVisible.value = false
  calcPopoverPos(event)
  deleteVisible.value = true
  adjustPopoverPos()
}

function confirmDelete() {
  emit('delete', props.item)
  deleteVisible.value = false
}

// ===== Tooltip =====
let tooltipEl = null

function onMouseEnter(event, text) {
  hideTooltip()
  const target = event.currentTarget
  const label = target.querySelector('.nav-label')
  if (label && label.scrollWidth <= label.clientWidth) return
  
  tooltipEl = document.createElement('div')
  tooltipEl.className = 'nav-tooltip'
  tooltipEl.textContent = text
  tooltipEl.style.cssText = `
    position: fixed;
    background: #1f2328;
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    z-index: 9999;
    max-width: 300px;
    word-break: break-all;
    user-select: text;
    cursor: text;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `
  document.body.appendChild(tooltipEl)
  const rect = target.getBoundingClientRect()
  tooltipEl.style.left = `${rect.right + 8}px`
  tooltipEl.style.top = `${rect.top}px`
  const tooltipRect = tooltipEl.getBoundingClientRect()
  if (tooltipRect.right > window.innerWidth - 10) {
    tooltipEl.style.left = `${rect.left - tooltipRect.width - 8}px`
  }
  // 底部溢出修正
  if (tooltipRect.bottom > window.innerHeight - 10) {
    tooltipEl.style.top = `${window.innerHeight - tooltipRect.height - 10}px`
  }
}

function onMouseLeave() {
  hideTooltip()
}

function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.remove()
    tooltipEl = null
  }
}
</script>
