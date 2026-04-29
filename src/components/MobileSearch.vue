<template>
  <div class="mobile-search-page">
    <!-- 搜索输入区 -->
    <div class="mobile-search-header">
      <div class="mobile-search-input-wrapper">
        <Search :size="16" class="mobile-search-icon" />
        <input
          ref="inputRef"
          type="text"
          class="mobile-search-input"
          placeholder="搜索文档..."
          v-model="searchQuery"
          @input="doSearch(searchQuery)"
          @keydown.escape="$emit('close')"
          @keydown.enter="handleEnter"
          @keydown.up.prevent="moveSelection(-1)"
          @keydown.down.prevent="moveSelection(1)"
        />
        <button v-if="searchQuery" class="mobile-search-clear" @click="clearSearch">
          <X :size="14" />
        </button>
      </div>
      <button class="mobile-search-cancel" @click="$emit('close')">取消</button>
    </div>
    <!-- 搜索结果 -->
    <div class="mobile-search-results">
      <div v-if="!searchReady && indexBuilding" class="mobile-search-tip">
        正在构建索引...
      </div>
      <div v-else-if="searchQuery && searchResults.length === 0" class="mobile-search-empty">
        没有找到相关文档
      </div>
      <template v-else-if="searchResults.length > 0">
        <div
          v-for="(item, index) in searchResults"
          :key="item.key"
          :class="['mobile-search-item', { active: index === selectedIndex }]"
          @click="selectResult(item)"
        >
          <FileText :size="14" class="mobile-search-item-icon" />
          <span class="mobile-search-item-title">{{ item.title }}</span>
        </div>
      </template>
      <div v-else class="mobile-search-tip">输入关键词搜索文档内容</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { Search, X, FileText } from 'lucide-vue-next'
import { useSearch } from '../composables/useSearch.js'

const emit = defineEmits(['close', 'select'])

const { searchQuery, searchResults, searchReady, indexBuilding, doSearch, openSearch } = useSearch()

const inputRef = ref(null)
const selectedIndex = ref(0)

// 页面挂载时自动聚焦并构建索引
onMounted(async () => {
  await openSearch()
  await nextTick()
  inputRef.value?.focus()
})

// 搜索结果变化时重置选中
watch(searchResults, () => {
  selectedIndex.value = 0
})

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
  inputRef.value?.focus()
}

function moveSelection(delta) {
  const len = searchResults.value.length
  if (len === 0) return
  selectedIndex.value = (selectedIndex.value + delta + len) % len
}

function handleEnter() {
  if (searchResults.value.length > 0) {
    selectResult(searchResults.value[selectedIndex.value])
  }
}

function selectResult(item) {
  // 清理搜索状态
  searchQuery.value = ''
  searchResults.value = []
  emit('select', item.key)
}
</script>
