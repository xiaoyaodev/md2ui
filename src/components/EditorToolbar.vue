<template>
  <div class="editor-toolbar">
    <div class="editor-toolbar-group">
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('bold') }"
        @click="editor.chain().focus().toggleBold().run()"
        title="加粗 (Ctrl+B)"
      >
        <Bold :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('italic') }"
        @click="editor.chain().focus().toggleItalic().run()"
        title="斜体 (Ctrl+I)"
      >
        <Italic :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('underline') }"
        @click="editor.chain().focus().toggleUnderline().run()"
        title="下划线 (Ctrl+U)"
      >
        <UnderlineIcon :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('strike') }"
        @click="editor.chain().focus().toggleStrike().run()"
        title="删除线"
      >
        <Strikethrough :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('code') }"
        @click="editor.chain().focus().toggleCode().run()"
        title="行内代码"
      >
        <Code :size="15" />
      </button>
    </div>

    <div class="editor-toolbar-divider"></div>

    <div class="editor-toolbar-group">
      <button
        v-for="level in [1, 2, 3, 4]"
        :key="level"
        class="editor-toolbar-btn heading-btn"
        :class="{ active: editor.isActive('heading', { level }) }"
        @click="editor.chain().focus().toggleHeading({ level }).run()"
        :title="`标题 ${level}`"
      >
        H{{ level }}
      </button>
    </div>

    <div class="editor-toolbar-divider"></div>

    <div class="editor-toolbar-group">
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('bulletList') }"
        @click="editor.chain().focus().toggleBulletList().run()"
        title="无序列表"
      >
        <List :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('orderedList') }"
        @click="editor.chain().focus().toggleOrderedList().run()"
        title="有序列表"
      >
        <ListOrdered :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('taskList') }"
        @click="editor.chain().focus().toggleTaskList().run()"
        title="任务列表"
      >
        <ListChecks :size="15" />
      </button>
    </div>

    <div class="editor-toolbar-divider"></div>

    <div class="editor-toolbar-group">
      <button
        class="editor-toolbar-btn"
        :class="{ active: editor.isActive('blockquote') }"
        @click="editor.chain().focus().toggleBlockquote().run()"
        title="引用"
      >
        <Quote :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        @click="editor.chain().focus().setHorizontalRule().run()"
        title="分割线"
      >
        <Minus :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        @click="editor.chain().focus().toggleCodeBlock().run()"
        :class="{ active: editor.isActive('codeBlock') }"
        title="代码块"
      >
        <FileCode :size="15" />
      </button>
      <div class="table-picker-wrapper" ref="tablePickerRef">
        <button
          class="editor-toolbar-btn"
          @click="toggleTablePicker"
          title="插入表格"
        >
          <TableIcon :size="15" />
        </button>
        <div v-if="showTablePicker" class="table-picker-dropdown">
          <div class="table-picker-label">{{ pickerRows }} x {{ pickerCols }}</div>
          <div class="table-picker-grid"
            @mouseleave="pickerRows = 1; pickerCols = 1"
          >
            <div
              v-for="r in 8" :key="r"
              class="table-picker-row"
            >
              <div
                v-for="c in 8" :key="c"
                class="table-picker-cell"
                :class="{ active: r <= pickerRows && c <= pickerCols }"
                @mouseenter="pickerRows = r; pickerCols = c"
                @click="confirmInsertTable(r, c)"
              ></div>
            </div>
          </div>
        </div>
      </div>
      <button
        class="editor-toolbar-btn"
        @click="insertImage"
        title="插入图片"
      >
        <ImageIcon :size="15" />
      </button>
      <button
        class="editor-toolbar-btn math-toolbar-btn"
        @click="insertMathInline"
        title="行内公式"
      >
        <span class="math-toolbar-icon">$</span>
      </button>
      <button
        class="editor-toolbar-btn math-toolbar-btn"
        @click="insertMathBlock"
        title="块级公式"
      >
        <span class="math-toolbar-icon">$$</span>
      </button>
    </div>

    <div class="editor-toolbar-divider"></div>

    <div class="editor-toolbar-group">
      <button
        class="editor-toolbar-btn"
        @click="editor.chain().focus().undo().run()"
        :disabled="!editor.can().undo()"
        title="撤销 (Ctrl+Z)"
      >
        <Undo :size="15" />
      </button>
      <button
        class="editor-toolbar-btn"
        @click="editor.chain().focus().redo().run()"
        :disabled="!editor.can().redo()"
        title="重做 (Ctrl+Shift+Z)"
      >
        <Redo :size="15" />
      </button>
    </div>

    <div class="editor-toolbar-spacer"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  List, ListOrdered, ListChecks, Quote, Minus, FileCode,
  Table as TableIcon, Image as ImageIcon,
  Undo, Redo
} from 'lucide-vue-next'

const props = defineProps({
  editor: { type: Object, required: true }
})

defineEmits([])

// 表格行列选择器
const showTablePicker = ref(false)
const pickerRows = ref(1)
const pickerCols = ref(1)
const tablePickerRef = ref(null)

function toggleTablePicker() {
  showTablePicker.value = !showTablePicker.value
  pickerRows.value = 1
  pickerCols.value = 1
}

function confirmInsertTable(rows, cols) {
  props.editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  showTablePicker.value = false
}

// 点击外部关闭选择器
function handleClickOutside(e) {
  if (tablePickerRef.value && !tablePickerRef.value.contains(e.target)) {
    showTablePicker.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

function insertImage() {
  const url = window.prompt('输入图片 URL:')
  if (url) {
    props.editor.chain().focus().setImage({ src: url }).run()
  }
}

// 插入行内公式
function insertMathInline() {
  const latex = window.prompt('输入行内 LaTeX 公式:', 'E=mc^2')
  if (latex !== null && latex.trim()) {
    props.editor.chain().focus().insertContent({
      type: 'mathInline',
      attrs: { latex: latex.trim() },
    }).run()
  }
}

// 插入块级公式
function insertMathBlock() {
  props.editor.chain().focus().insertContent({
    type: 'mathBlock',
    content: [{ type: 'text', text: '\\int_0^\\infty e^{-x} dx' }],
  }).run()
}
</script>
