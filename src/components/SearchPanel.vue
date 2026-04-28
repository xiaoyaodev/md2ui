<template>
  <teleport to="body">
    <div v-if="visible" class="search-overlay" @click.self="$emit('close')">
      <div class="search-panel">
        <div class="search-input-wrapper">
          <Search :size="18" class="search-icon" />
          <input
            ref="inputRef"
            type="text"
            class="search-input"
            placeholder="搜索文档..."
            :value="query"
            @input="$emit('search', $event.target.value)"
            @keydown.escape="$emit('close')"
            @keydown.enter="handleEnter"
            @keydown.up.prevent="moveSelection(-1)"
            @keydown.down.prevent="moveSelection(1)"
          />
          <kbd class="search-kbd">ESC</kbd>
        </div>
        <div class="search-results" v-if="query">
          <div v-if="results.length === 0" class="search-empty">
            没有找到相关文档
          </div>
          <div
            v-for="(item, index) in results"
            :key="item.key"
            :class="['search-result-item', { active: index === selectedIndex }]"
            @click="selectResult(item)"
            @mouseenter="selectedIndex = index"
          >
            <FileText :size="16" class="result-icon" />
            <span class="result-title">{{ item.title }}</span>
          </div>
        </div>
        <div class="search-footer" v-if="!query">
          <span class="search-tip">输入关键词搜索文档内容</span>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { Search, FileText } from 'lucide-vue-next'

const props = defineProps({
  visible: { type: Boolean, default: false },
  query: { type: String, default: '' },
  results: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'search', 'select'])
const inputRef = ref(null)
const selectedIndex = ref(0)

// 面板打开时自动聚焦输入框
watch(() => props.visible, (val) => {
  if (val) {
    selectedIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
})

// 搜索结果变化时重置选中
watch(() => props.results, () => {
  selectedIndex.value = 0
})

// 键盘上下移动选中项
function moveSelection(delta) {
  const len = props.results.length
  if (len === 0) return
  selectedIndex.value = (selectedIndex.value + delta + len) % len
}

// 回车选中
function handleEnter() {
  if (props.results.length > 0) {
    selectResult(props.results[selectedIndex.value])
  }
}

// 选中结果
function selectResult(item) {
  emit('select', item.key)
  emit('close')
}
</script>
