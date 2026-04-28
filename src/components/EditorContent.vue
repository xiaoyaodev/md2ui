<template>
  <main class="content editor-content" @scroll="$emit('scroll', $event)" @click="$emit('content-click', $event)">
    <WelcomePage v-if="showWelcome" @start="$emit('start')" />
    <template v-else>
      <EditorToolbar v-if="editor" :editor="editor" />
      <div v-if="hasFrontmatter" class="markdown-content">
        <div class="code-block-wrapper frontmatter-block frontmatter-editor-block">
          <div class="code-block-header">
            <span class="code-lang-label">FRONTMATTER</span>
            <div class="code-block-actions">
              <button class="code-action-btn" :data-tooltip="frontmatterCollapsed ? '展开' : '折叠'" @click="frontmatterCollapsed = !frontmatterCollapsed">
                <svg v-if="frontmatterCollapsed" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
            </div>
          </div>
          <div v-show="!frontmatterCollapsed" class="code-block-body frontmatter-edit-body">
            <div class="fm-edit-layout">
              <div class="fm-line-gutter" aria-hidden="true">
                <span v-for="n in fmLineCount" :key="n" class="code-ln-num">{{ n }}</span>
              </div>
              <textarea ref="fmTextarea" class="frontmatter-textarea" :value="frontmatterYaml" @input="onFrontmatterInput" spellcheck="false" rows="1" />
            </div>
          </div>
        </div>
      </div>
      <article class="markdown-content editor-area">
        <editor-content :editor="editor" />
      </article>
      <nav v-if="prevDoc || nextDoc" class="doc-nav">
        <a v-if="prevDoc" class="doc-nav-link prev" @click.prevent="$emit('load-doc', prevDoc.key)">
          <ChevronLeft :size="16" />
          <div class="doc-nav-text">
            <span class="doc-nav-label">上一篇</span>
            <span class="doc-nav-title">{{ prevDoc.label }}</span>
          </div>
        </a>
        <div v-else></div>
        <a v-if="nextDoc" class="doc-nav-link next" @click.prevent="$emit('load-doc', nextDoc.key)">
          <div class="doc-nav-text">
            <span class="doc-nav-label">下一篇</span>
            <span class="doc-nav-title">{{ nextDoc.label }}</span>
          </div>
          <ChevronRight :size="16" />
        </a>
      </nav>
    </template>
  </main>
</template>

<script setup>
import { watch, onBeforeUnmount, onMounted, ref, onUnmounted, computed, nextTick } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Underline } from '@tiptap/extension-underline'
import { Markdown } from 'tiptap-markdown'
import { MermaidBlock } from '../extensions/MermaidBlock.js'
import { CodeBlockCustom } from '../extensions/CodeBlockCustom.js'
import { TableControls } from '../extensions/TableControls.js'
import { MathBlock } from '../extensions/MathBlock.js'
import { MathInline } from '../extensions/MathInline.js'
import { uploadImage } from '../services/DocService.js'
import { parseFrontmatter } from '../composables/useFrontmatter.js'
import WelcomePage from './WelcomePage.vue'
import EditorToolbar from './EditorToolbar.vue'

const props = defineProps({
  showWelcome: { type: Boolean, default: true },
  markdownContent: { type: String, default: '' },
  prevDoc: { type: Object, default: null },
  nextDoc: { type: Object, default: null },
  docTitle: { type: String, default: '' },
  currentDocPath: { type: String, default: '' }
})

const emit = defineEmits(['scroll', 'content-click', 'start', 'load-doc', 'save', 'update:markdownContent'])

const frontmatterYaml = ref('')
const hasFrontmatter = computed(() => frontmatterYaml.value.length > 0)
const frontmatterCollapsed = ref(false)
const fmTextarea = ref(null)

const fmLineCount = computed(() => {
  const text = frontmatterYaml.value
  if (!text) return 1
  return text.split('\n').length
})

function splitFrontmatter(markdown) {
  const { content, rawYaml } = parseFrontmatter(markdown)
  return { yaml: rawYaml, body: content }
}

function joinFrontmatter(yaml, body) {
  if (!yaml.trim()) return body
  return '---\n' + yaml + '\n---\n' + body
}

function getFullMarkdown() {
  if (!editor.value) return ''
  const body = editor.value.storage.markdown.getMarkdown()
  return joinFrontmatter(frontmatterYaml.value, body)
}

function onFrontmatterInput(e) {
  frontmatterYaml.value = e.target.value
  autoResizeTextarea(e.target)
  emit('update:markdownContent', getFullMarkdown())
  scheduleAutoSave()
}

function autoResizeTextarea(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (!editor.value || !props.currentDocPath) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    const md = getFullMarkdown()
    emit('save', { path: props.currentDocPath, content: md })
  }
}

onMounted(() => { window.addEventListener('keydown', handleKeydown) })
onUnmounted(() => { window.removeEventListener('keydown', handleKeydown) })

let autoSaveTimer = null
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    if (!editor.value || !props.currentDocPath) return
    const md = getFullMarkdown()
    emit('save', { path: props.currentDocPath, content: md })
  }, 1000)
}

onUnmounted(() => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    if (editor.value && props.currentDocPath) {
      const md = getFullMarkdown()
      emit('save', { path: props.currentDocPath, content: md })
    }
  }
})

const isExternalUpdate = ref(false)

function preloadImage(src) {
  return new Promise((resolve) => {
    const img = document.createElement('img')
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = src
  })
}

async function handleImageUpload(file, editorInstance) {
  if (!file || !file.type.startsWith('image/')) return
  if (!props.currentDocPath) return
  try {
    const url = await uploadImage(file, props.currentDocPath)
    await preloadImage(url)
    editorInstance.chain().focus().setImage({ src: url }).run()
  } catch (e) {
    console.error('upload failed:', e)
  }
}

function createImagePasteProps(getEditor) {
  return {
    handlePaste(view, event) {
      const items = event.clipboardData?.items
      if (!items) return false
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault()
          const file = item.getAsFile()
          if (file) handleImageUpload(file, getEditor())
          return true
        }
      }
      return false
    },
    handleDrop(view, event) {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return false
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
      if (imageFiles.length === 0) return false
      event.preventDefault()
      const editorInstance = getEditor()
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (pos) {
        editorInstance.commands.focus()
        editorInstance.commands.setTextSelection(pos.pos)
      }
      imageFiles.forEach(file => handleImageUpload(file, editorInstance))
      return true
    },
  }
}

const { yaml: initYaml, body: initBody } = splitFrontmatter(props.markdownContent)
frontmatterYaml.value = initYaml

const editor = useEditor({
  extensions: [
    StarterKit.configure({ codeBlock: false }),
    Table.configure({ resizable: true }),
    TableRow, TableCell, TableHeader,
    TaskList, TaskItem.configure({ nested: true }),
    Image, Underline,
    MermaidBlock, CodeBlockCustom, TableControls,
    MathBlock, MathInline,
    Placeholder.configure({ placeholder: '开始编写文档...' }),
    Markdown.configure({ html: true, transformPastedText: true, transformCopiedText: true }),
  ],
  content: initBody,
  editorProps: createImagePasteProps(() => editor.value),
  onUpdate: ({ editor }) => {
    if (isExternalUpdate.value) return
    emit('update:markdownContent', getFullMarkdown())
    scheduleAutoSave()
  },
})

onMounted(() => {
  nextTick(() => { if (fmTextarea.value) autoResizeTextarea(fmTextarea.value) })
})

watch(() => props.markdownContent, (newContent) => {
  if (!editor.value) return
  const { yaml, body } = splitFrontmatter(newContent)
  frontmatterYaml.value = yaml
  nextTick(() => { if (fmTextarea.value) autoResizeTextarea(fmTextarea.value) })
  const currentMd = editor.value.storage.markdown.getMarkdown()
  if (currentMd === body) return
  isExternalUpdate.value = true
  editor.value.commands.setContent(body)
  isExternalUpdate.value = false
})

onBeforeUnmount(() => { editor.value?.destroy() })
</script>
