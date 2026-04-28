import { ref } from 'vue'
import MiniSearch from 'minisearch'

// 搜索索引实例
let searchIndex = null
// 缓存文档列表引用，用于懒加载
let pendingDocsList = null

// 扁平化文档树，提取所有文件节点
function flattenDocs(items, result = []) {
  for (const item of items) {
    if (item.type === 'file') result.push(item)
    if (item.type === 'folder' && item.children) {
      flattenDocs(item.children, result)
    }
  }
  return result
}

// 单例状态，确保多处调用共享同一份
const searchVisible = ref(false)
const searchQuery = ref('')
const searchResults = ref([])
const searchReady = ref(false)
const indexBuilding = ref(false)

export function useSearch() {

  // 注册文档列表（不立即构建索引，等用户打开搜索时再构建）
  function buildIndex(docsList) {
    pendingDocsList = docsList
    // 如果索引已存在，标记需要重建
    if (searchIndex) {
      searchIndex = null
      searchReady.value = false
    }
  }

  // 实际构建搜索索引
  async function ensureIndex() {
    if (searchReady.value || indexBuilding.value || !pendingDocsList) return
    indexBuilding.value = true

    const docs = flattenDocs(pendingDocsList)
    const documents = []

    for (const doc of docs) {
      try {
        const response = await fetch(doc.path)
        if (response.ok) {
          const content = await response.text()
          documents.push({
            id: doc.key,
            title: doc.label,
            content: content.replace(/^---[\s\S]*?---\n?/, ''), // 去掉 frontmatter
            path: doc.path
          })
        }
      } catch {
        // 忽略加载失败的文档
      }
    }

    searchIndex = new MiniSearch({
      fields: ['title', 'content'],
      storeFields: ['title'],
      searchOptions: {
        boost: { title: 3 },
        fuzzy: 0.2,
        prefix: true
      },
      // 中文分词：按标点、空格、换行分割
      tokenize: (text) => {
        const tokens = text.split(/[\s\n\r\t,.;:!?，。；：！？、（）()【】\[\]{}""''""]+/)
          .filter(t => t.length > 0)
        // 对中文文本额外做 bigram 分词
        const bigrams = []
        for (const token of tokens) {
          if (/[\u4e00-\u9fff]/.test(token) && token.length > 1) {
            for (let i = 0; i < token.length - 1; i++) {
              bigrams.push(token.slice(i, i + 2))
            }
          }
        }
        return [...tokens, ...bigrams]
      }
    })

    searchIndex.addAll(documents)
    searchReady.value = true
    indexBuilding.value = false
  }

  // 执行搜索
  function doSearch(query) {
    searchQuery.value = query
    if (!query.trim() || !searchIndex) {
      searchResults.value = []
      return
    }
    const results = searchIndex.search(query, { limit: 20 })
    searchResults.value = results.map(r => ({
      key: r.id,
      title: r.title,
      score: r.score
    }))
  }

  // 打开搜索面板（触发懒加载索引构建）
  async function openSearch() {
    searchVisible.value = true
    await ensureIndex()
  }

  // 关闭搜索面板
  function closeSearch() {
    searchVisible.value = false
    searchQuery.value = ''
    searchResults.value = []
  }

  return {
    searchVisible,
    searchQuery,
    searchResults,
    searchReady,
    indexBuilding,
    buildIndex,
    doSearch,
    openSearch,
    closeSearch
  }
}
