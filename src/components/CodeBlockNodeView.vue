<template>
  <node-view-wrapper class="code-block-wrapper editor-code-block" data-type="codeBlock">
    <!-- 代码块 header -->
    <div class="code-block-header" contenteditable="false">
      <input
        class="code-lang-input"
        :value="node.attrs.language || ''"
        @input="updateLanguage"
        placeholder="语言"
        spellcheck="false"
      />
      <div class="code-block-actions">
        <button class="code-action-btn" :class="{ copied }" @click="copyCode" title="复制代码">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span class="copy-text">{{ copied ? '已复制' : '复制' }}</span>
        </button>
      </div>
    </div>
    <!-- 代码编辑区域：行号 gutter + 编辑区 -->
    <div class="code-block-body">
      <div class="code-edit-layout">
        <!-- 行号列 -->
        <div class="code-line-gutter" contenteditable="false" aria-hidden="true">
          <span v-for="n in lineCount" :key="n" class="code-ln-num">{{ n }}</span>
        </div>
        <!-- 编辑区 -->
        <pre class="code-edit-area"><node-view-content as="code" :class="codeClass" /></pre>
      </div>
    </div>
  </node-view-wrapper>
</template>

<script setup>
import { ref, computed } from 'vue'
import { nodeViewProps, NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps(nodeViewProps)
const copied = ref(false)

const codeClass = computed(() => {
  const lang = props.node.attrs.language
  return lang ? `language-${lang}` : ''
})

// 根据代码内容计算行数（响应式，编辑时自动更新）
const lineCount = computed(() => {
  const text = props.node.textContent
  if (!text) return 1
  return text.split('\n').length
})

// 更新语言属性
function updateLanguage(e) {
  props.updateAttributes({ language: e.target.value || null })
}

// 复制代码
async function copyCode() {
  const text = props.node.textContent
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // fallback
  }
}
</script>
