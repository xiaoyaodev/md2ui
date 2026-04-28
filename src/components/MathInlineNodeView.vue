<template>
  <node-view-wrapper as="span" class="math-inline-wrapper" :class="{ 'math-inline-editing': showEditor }">
    <!-- 渲染态：显示 KaTeX 结果，点击进入编辑 -->
    <span
      v-if="renderedHtml && !renderError"
      class="math-inline-rendered"
      :class="{ 'math-inline-selected': selected }"
      v-html="renderedHtml"
      @click.stop="openEditor"
      title="点击编辑公式"
    ></span>
    <!-- 渲染失败：显示源码 -->
    <span
      v-else
      class="math-inline-error"
      @click.stop="openEditor"
      title="公式有误，点击编辑"
    >{{ latex }}</span>

    <!-- 编辑浮层 -->
    <div v-if="showEditor" ref="popoverRef" class="math-inline-popover" @click.stop>
      <div class="math-inline-popover-header">
        <span class="math-inline-popover-label">行内公式</span>
        <div class="math-inline-popover-actions">
          <button class="math-inline-popover-btn delete" @click="deleteNode" title="删除公式">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
          </button>
          <button class="math-inline-popover-btn done" @click="closeEditor" title="完成">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
        </div>
      </div>
      <input
        ref="inputRef"
        class="math-inline-popover-input"
        :value="latex"
        @input="onInput"
        @keydown.enter.prevent="closeEditor"
        @keydown.escape.prevent="closeEditor"
        spellcheck="false"
        placeholder="LaTeX 公式"
      />
      <!-- 实时预览 -->
      <div v-if="liveHtml" class="math-inline-popover-preview" v-html="liveHtml"></div>
      <div v-else-if="liveError" class="math-inline-popover-preview math-inline-popover-error">{{ liveError }}</div>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import katex from 'katex'

const props = defineProps(nodeViewProps)

const showEditor = ref(false)
const renderedHtml = ref('')
const renderError = ref(false)
const liveHtml = ref('')
const liveError = ref('')
const inputRef = ref(null)
const popoverRef = ref(null)

const latex = computed(() => props.node.attrs.latex || '')

// 渲染 KaTeX
function renderKatex(text) {
  if (!text.trim()) return { html: '', error: '' }
  try {
    const html = katex.renderToString(text.trim(), { throwOnError: true, displayMode: false })
    return { html, error: '' }
  } catch (e) {
    return { html: '', error: e.message || '渲染失败' }
  }
}

function updateRender() {
  const { html, error } = renderKatex(latex.value)
  renderedHtml.value = html
  renderError.value = !!error
}

function updateLivePreview(text) {
  const { html, error } = renderKatex(text)
  liveHtml.value = html
  liveError.value = error
}

function openEditor() {
  showEditor.value = true
  updateLivePreview(latex.value)
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus()
      inputRef.value.select()
    }
  })
}

function closeEditor() {
  showEditor.value = false
  updateRender()
}

function deleteNode() {
  const pos = props.getPos()
  props.editor.chain().focus().deleteRange({ from: pos, to: pos + props.node.nodeSize }).run()
}

function onInput(e) {
  const newLatex = e.target.value
  props.updateAttributes({ latex: newLatex })
  updateLivePreview(newLatex)
}

// 点击外部关闭浮层
function handleClickOutside(e) {
  if (showEditor.value && popoverRef.value && !popoverRef.value.contains(e.target)) {
    closeEditor()
  }
}

onMounted(() => {
  updateRender()
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})

watch(latex, () => {
  if (!showEditor.value) {
    updateRender()
  }
})
</script>
