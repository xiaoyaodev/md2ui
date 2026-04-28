<template>
  <teleport to="body">
    <div
      v-if="show"
      ref="menuRef"
      class="table-bubble-menu"
      :style="menuStyle"
    >
      <div class="table-bubble-group">
        <button class="table-bubble-btn" @click="addColumnBefore" title="在左侧插入列">
          <BetweenVerticalStart :size="14" />
        </button>
        <button class="table-bubble-btn" @click="addColumnAfter" title="在右侧插入列">
          <BetweenVerticalEnd :size="14" />
        </button>
        <button class="table-bubble-btn danger" @click="deleteColumn" title="删除当前列">
          <Columns3 :size="14" />
          <X :size="10" class="table-bubble-badge" />
        </button>
      </div>
      <div class="table-bubble-divider"></div>
      <div class="table-bubble-group">
        <button class="table-bubble-btn" @click="addRowBefore" title="在上方插入行">
          <BetweenHorizontalStart :size="14" />
        </button>
        <button class="table-bubble-btn" @click="addRowAfter" title="在下方插入行">
          <BetweenHorizontalEnd :size="14" />
        </button>
        <button class="table-bubble-btn danger" @click="deleteRow" title="删除当前行">
          <RowsIcon :size="14" />
          <X :size="10" class="table-bubble-badge" />
        </button>
      </div>
      <div class="table-bubble-divider"></div>
      <div class="table-bubble-group">
        <button class="table-bubble-btn" @click="mergeCells" title="合并单元格">
          <TableCellsMerge :size="14" />
        </button>
        <button class="table-bubble-btn" @click="splitCell" title="拆分单元格">
          <TableCellsSplit :size="14" />
        </button>
      </div>
      <div class="table-bubble-divider"></div>
      <button class="table-bubble-btn danger" @click="deleteTable" title="删除表格">
        <Trash2 :size="14" />
      </button>
    </div>
  </teleport>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  BetweenVerticalStart, BetweenVerticalEnd, Columns3,
  BetweenHorizontalStart, BetweenHorizontalEnd, Rows3 as RowsIcon,
  TableCellsMerge, TableCellsSplit,
  Trash2, X,
} from 'lucide-vue-next'

const props = defineProps({
  editor: { type: Object, required: true }
})

const menuRef = ref(null)
const menuStyle = ref({})

const show = computed(() => {
  if (!props.editor) return false
  if (props.editor.isActive('codeBlock') || props.editor.isActive('mermaidBlock')) return false
  return props.editor.isActive('table')
})

// 计算菜单位置：定位到表格上方
function updatePosition() {
  if (!show.value || !props.editor) return

  const { view } = props.editor
  const { state } = view

  // 找到当前所在的 table 节点
  let tablePos = null
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tablePos = $from.start(d) - 1
      break
    }
  }
  if (tablePos === null) return

  // 获取表格 DOM 元素的位置
  const dom = view.nodeDOM(tablePos)
  if (!dom) return

  const tableRect = dom.getBoundingClientRect()
  const menuEl = menuRef.value
  if (!menuEl) return

  const menuWidth = menuEl.offsetWidth
  // 水平居中于表格上方
  let left = tableRect.left + (tableRect.width - menuWidth) / 2
  let top = tableRect.top - menuEl.offsetHeight - 8

  // 边界修正
  if (left < 8) left = 8
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8
  if (top < 8) top = tableRect.bottom + 8 // 表格上方放不下就放下方

  menuStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: `${top}px`,
    zIndex: 100,
  }
}

// 监听 show 变化和编辑器事务来更新位置
watch(show, async (val) => {
  if (val) {
    await nextTick()
    updatePosition()
  }
})

let updateTimer = null
function onTransaction() {
  if (!show.value) return
  if (updateTimer) cancelAnimationFrame(updateTimer)
  updateTimer = requestAnimationFrame(updatePosition)
}

onMounted(() => {
  if (props.editor) {
    props.editor.on('transaction', onTransaction)
    // 滚动时也更新位置
    const scrollEl = document.querySelector('.editor-content')
    if (scrollEl) scrollEl.addEventListener('scroll', updatePosition, { passive: true })
  }
})

onUnmounted(() => {
  if (props.editor) {
    props.editor.off('transaction', onTransaction)
  }
  const scrollEl = document.querySelector('.editor-content')
  if (scrollEl) scrollEl.removeEventListener('scroll', updatePosition)
  if (updateTimer) cancelAnimationFrame(updateTimer)
})

function addColumnBefore() {
  props.editor.chain().focus().addColumnBefore().run()
}
function addColumnAfter() {
  props.editor.chain().focus().addColumnAfter().run()
}
function deleteColumn() {
  props.editor.chain().focus().deleteColumn().run()
}
function addRowBefore() {
  props.editor.chain().focus().addRowBefore().run()
}
function addRowAfter() {
  props.editor.chain().focus().addRowAfter().run()
}
function deleteRow() {
  props.editor.chain().focus().deleteRow().run()
}
function mergeCells() {
  props.editor.chain().focus().mergeCells().run()
}
function splitCell() {
  props.editor.chain().focus().splitCell().run()
}
function deleteTable() {
  props.editor.chain().focus().deleteTable().run()
}
</script>
