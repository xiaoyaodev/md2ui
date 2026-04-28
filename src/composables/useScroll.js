import { ref } from 'vue'

// 单例状态，确保多处调用共享同一份
const scrollProgress = ref(0)
const showBackToTop = ref(false)
const activeHeading = ref('')

// 外部注入的 tocItems 引用，用于编辑模式下通过文本匹配标题
let _tocItemsRef = null

// 节流定时器，避免滚动时频繁查询 DOM
let _activeHeadingTimer = null

// 点击目录项后锁定，防止滚动检测覆盖 activeHeading 导致闪动
let _locked = false
let _lockTimer = null

// 标题元素缓存（避免每次滚动都 querySelectorAll）
let _headingsCache = null

// 标记：true 表示 activeHeading 被文档切换清空，不应同步到 URL
let _suppressHashClear = false

export function useScroll() {

  // 注入 tocItems 引用（由 useDocManager 调用一次）
  function setTocItems(tocItems) {
    _tocItemsRef = tocItems
  }

  // 重建标题缓存（文档渲染后调用）
  function rebuildHeadingsCache() {
    _headingsCache = null
  }

  function _getHeadings() {
    if (_headingsCache) return _headingsCache
    const content = document.querySelector('.content')
    if (!content) return []
    _headingsCache = [...content.querySelectorAll(
      '.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6'
    )]
    return _headingsCache
  }

  // 监听滚动：更新进度条和 activeHeading（驱动 TOC 高亮），不操作 URL
  function handleScroll(e) {
    const element = e.target
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight - element.clientHeight

    if (scrollHeight > 0) {
      scrollProgress.value = Math.round((scrollTop / scrollHeight) * 100)
      showBackToTop.value = scrollTop > 300
    }

    if (!_activeHeadingTimer) {
      _activeHeadingTimer = setTimeout(() => {
        _activeHeadingTimer = null
        updateActiveHeading()
      }, 80)
    }
  }

  // 提取标题纯文本（去掉锚点图标等子元素）
  function getHeadingText(heading) {
    const clone = heading.cloneNode(true)
    clone.querySelectorAll('.heading-anchor').forEach(a => a.remove())
    return clone.textContent.trim()
  }

  // 通过文本匹配在 tocItems 中查找对应 id（编辑模式下标题无 id 时使用）
  function findTocIdByText(text) {
    if (!_tocItemsRef || !_tocItemsRef.value) return ''
    const item = _tocItemsRef.value.find(t => t.text === text)
    return item ? item.id : ''
  }

  // 更新当前激活的标题
  function updateActiveHeading() {
    // 点击目录项后的锁定期内跳过，避免闪动
    if (_locked) return

    const content = document.querySelector('.content')
    if (!content) return

    const headings = _getHeadings()
    const scrollTop = content.scrollTop
    const contentRect = content.getBoundingClientRect()

    let currentId = ''
    for (const heading of headings) {
      const rect = heading.getBoundingClientRect()
      const offsetTop = rect.top - contentRect.top + scrollTop
      if (offsetTop <= scrollTop + 100) {
        currentId = heading.id || findTocIdByText(getHeadingText(heading))
      }
    }

    // 滚动导致的清空（滚到顶部），标记为非文档切换
    if (!currentId && activeHeading.value) {
      _suppressHashClear = false
    }
    activeHeading.value = currentId
  }

  // 解锁函数
  function _unlock() {
    _locked = false
    if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null }
  }

  // 滚动到指定标题
  function scrollToHeading(id) {
    activeHeading.value = id
    // 锁定，防止 smooth 滚动期间检测覆盖
    _locked = true
    if (_lockTimer) clearTimeout(_lockTimer)

    const content = document.querySelector('.content')

    // 优先用 scrollend 事件解锁，800ms 兜底
    if (content) {
      content.addEventListener('scrollend', _unlock, { once: true })
    }
    _lockTimer = setTimeout(() => {
      _unlock()
      // scrollend 可能已触发，removeEventListener 是安全的
      if (content) content.removeEventListener('scrollend', _unlock)
    }, 800)

    let el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    // 编辑模式下标题无 id，通过 tocItems 找到文本再匹配 DOM
    if (_tocItemsRef && _tocItemsRef.value) {
      const tocItem = _tocItemsRef.value.find(t => t.id === id)
      if (tocItem) {
        if (!content) return
        const headings = _getHeadings()
        for (const heading of headings) {
          if (getHeadingText(heading) === tocItem.text) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
    }
  }

  // 锁定 activeHeading 一段时间（供外部在非 smooth 滚动场景使用，如页面刷新定位锚点）
  function lockHeading(id, durationMs = 800) {
    activeHeading.value = id
    _locked = true
    if (_lockTimer) clearTimeout(_lockTimer)
    _lockTimer = setTimeout(_unlock, durationMs)
  }

  // 文档切换时清空 activeHeading（标记为文档切换，不同步清除 URL hash）
  function clearActiveHeading() {
    _suppressHashClear = true
    activeHeading.value = ''
  }

  // 查询当前是否为文档切换导致的清空
  function isSuppressHashClear() {
    return _suppressHashClear
  }

  // 返回顶部
  function scrollToTop() {
    const content = document.querySelector('.content')
    if (content) {
      content.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return {
    scrollProgress,
    showBackToTop,
    activeHeading,
    handleScroll,
    scrollToHeading,
    scrollToTop,
    setTocItems,
    rebuildHeadingsCache,
    clearActiveHeading,
    isSuppressHashClear,
    lockHeading
  }
}
