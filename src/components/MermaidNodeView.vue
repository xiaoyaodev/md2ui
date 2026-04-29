<template>
  <node-view-wrapper class="mermaid-block-wrapper" data-type="mermaidBlock">
    <!-- 预览模式：渲染图表 -->
    <div v-if="!editing" class="mermaid-preview">
      <div class="mermaid-edit-btn" title="编辑 Mermaid 代码" @click.stop="startEdit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </div>
      <div v-if="svgContent" class="mermaid-svg zoomable-image" v-html="svgContent" style="cursor: zoom-in" title="点击放大查看"></div>
      <div v-else-if="renderError" class="mermaid-error-tip">
        <span>图表渲染失败</span>
        <button class="mermaid-error-edit" @click.stop="startEdit">编辑代码</button>
      </div>
      <div v-else class="mermaid-loading">渲染中...</div>
    </div>
    <!-- 编辑模式：代码编辑器 -->
    <div v-else class="mermaid-editor">
      <div class="mermaid-editor-header">
        <span class="mermaid-editor-label">MERMAID</span>
        <button class="mermaid-editor-done" @click.stop="finishEdit" title="完成编辑">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>完成</span>
        </button>
      </div>
      <textarea
        ref="textareaRef"
        class="mermaid-editor-textarea"
        :value="code"
        @input="onInput"
        @keydown.tab.prevent="onTab"
        spellcheck="false"
      ></textarea>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import mermaid from 'mermaid'
import { getMermaidCache, setMermaidCache } from '../composables/useMermaidCache.js'

const props = defineProps(nodeViewProps)

const editing = ref(false)
const svgContent = ref('')
const renderError = ref(false)
const textareaRef = ref(null)

// 从节点内容获取代码文本
const code = computed(() => props.node.textContent || '')

// 渲染 Mermaid 图表
async function renderChart() {
  const text = code.value.trim()
  if (!text) {
    svgContent.value = ''
    renderError.value = false
    return
  }
  // 优先使用缓存
  const cached = getMermaidCache(text)
  if (cached) {
    svgContent.value = cached
    renderError.value = false
    return
  }
  try {
    const id = 'mermaid-editor-' + Math.random().toString(36).substr(2, 9)
    const { svg } = await mermaid.render(id, text)
    svgContent.value = svg
    renderError.value = false
    // 写入缓存
    setMermaidCache(text, svg)
  } catch (e) {
    console.error('Mermaid 编辑器渲染失败:', e)
    svgContent.value = ''
    renderError.value = true
    document.querySelectorAll('[id^="mermaid-editor-"][id$="-svg"]').forEach(el => {
      if (el.closest('.mermaid-block-wrapper') === null) el.remove()
    })
  }
}

// 进入编辑模式
function startEdit() {
  editing.value = true
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      autoResize()
    }
  })
}

// 完成编辑，回到预览模式
function finishEdit() {
  editing.value = false
  renderChart()
}

// 输入处理：更新节点内容
function onInput(e) {
  const newText = e.target.value
  const { tr } = props.editor.state
  const pos = props.getPos()
  // 替换节点内部全部文本
  tr.replaceWith(
    pos + 1,
    pos + props.node.nodeSize - 1,
    newText ? props.editor.schema.text(newText) : []
  )
  props.editor.view.dispatch(tr)
  autoResize()
}

// Tab 键插入两个空格
function onTab(e) {
  const ta = e.target
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const val = ta.value
  const newVal = val.substring(0, start) + '  ' + val.substring(end)
  // 先更新 textarea 显示
  ta.value = newVal
  ta.selectionStart = ta.selectionEnd = start + 2
  // 同步到节点
  onInput({ target: ta })
}

// 自动调整 textarea 高度
function autoResize() {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
    }
  })
}

// 监听代码变化（外部更新时重新渲染）
watch(code, () => {
  if (!editing.value) {
    renderChart()
  }
})

onMounted(() => {
  renderChart()
})
</script>
