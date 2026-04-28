<template>
  <node-view-wrapper class="math-block-wrapper" data-type="mathBlock">
    <!-- 预览模式 -->
    <div v-if="!editing" class="math-block-preview" contenteditable="false" @click.stop="startEdit">
      <div class="math-block-edit-btn" title="编辑公式">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </div>
      <div v-if="renderedHtml && !renderError" class="math-block-rendered" v-html="renderedHtml"></div>
      <div v-else-if="renderError" class="math-block-error-tip">
        <span>公式渲染失败</span>
        <button class="math-block-error-edit" @click.stop="startEdit">编辑公式</button>
      </div>
      <div v-else class="math-block-empty" @click.stop="startEdit">
        <span>点击输入数学公式</span>
      </div>
    </div>
    <!-- 编辑模式：上方编辑区 + 下方实时预览 -->
    <div v-else class="math-block-editor" contenteditable="false">
      <div class="math-block-editor-header">
        <span class="math-block-editor-label">LATEX</span>
        <div class="math-block-editor-actions">
          <button class="math-block-editor-delete" @click.stop="deleteBlock" title="删除公式块">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
          <button class="math-block-editor-done" @click.stop="finishEdit" title="完成编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>完成</span>
          </button>
        </div>
      </div>
      <textarea
        ref="textareaRef"
        class="math-block-editor-textarea"
        :value="latex"
        @input="onInput"
        @keydown.tab.prevent="onTab"
        @keydown.escape.prevent="finishEdit"
        spellcheck="false"
        placeholder="输入 LaTeX 公式，如 \int_0^\infty e^{-x} dx"
      ></textarea>
      <!-- 实时预览 -->
      <div class="math-block-live-preview">
        <div v-if="liveHtml && !liveError" class="math-block-live-rendered" v-html="liveHtml"></div>
        <div v-else-if="liveError" class="math-block-live-error">{{ liveError }}</div>
        <div v-else class="math-block-live-placeholder">预览区域</div>
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import katex from 'katex'

const props = defineProps(nodeViewProps)

const editing = ref(false)
const renderedHtml = ref('')
const renderError = ref(false)
const liveHtml = ref('')
const liveError = ref('')
const textareaRef = ref(null)

// 从节点属性获取 LaTeX 代码
const latex = computed(() => props.node.attrs.latex || '')

// 渲染 KaTeX
function renderKatex(text, displayMode = true) {
  const trimmed = (text || '').trim()
  if (!trimmed) return { html: '', error: '' }
  try {
    const html = katex.renderToString(trimmed, { throwOnError: true, displayMode })
    return { html, error: '' }
  } catch (e) {
    return { html: '', error: e.message || '渲染失败' }
  }
}

function updatePreview() {
  const { html, error } = renderKatex(latex.value)
  renderedHtml.value = html
  renderError.value = !!error
}

function updateLivePreview(text) {
  const { html, error } = renderKatex(text || latex.value)
  liveHtml.value = html
  liveError.value = error
}

function startEdit() {
  editing.value = true
  updateLivePreview()
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      autoResize()
    }
  })
}

function finishEdit() {
  editing.value = false
  updatePreview()
}

function deleteBlock() {
  const pos = props.getPos()
  props.editor.chain().focus().deleteRange({ from: pos, to: pos + props.node.nodeSize }).run()
}

function onInput(e) {
  const newLatex = e.target.value
  props.updateAttributes({ latex: newLatex })
  autoResize()
  updateLivePreview(newLatex)
}

function onTab(e) {
  const ta = e.target
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const val = ta.value
  const newVal = val.substring(0, start) + '  ' + val.substring(end)
  ta.value = newVal
  ta.selectionStart = ta.selectionEnd = start + 2
  onInput({ target: ta })
}

function autoResize() {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      textareaRef.value.style.height = textareaRef.value.scrollHeight + 'px'
    }
  })
}

watch(latex, () => {
  if (!editing.value) {
    updatePreview()
  }
})

onMounted(() => {
  updatePreview()
})
</script>
