import { ref } from 'vue'

// 单例状态，确保多处调用共享同一份
const scrollProgress = ref(0)
const showBackToTop = ref(false)
const activeHeading = ref('')

// 外部注入的 tocItems 引用，用于编辑模式下通过文本匹配标题
let _tocItemsRef = null

// 节流定时器，避免滚动时频繁查询 DOM
let _activeHeadingTimer = null

// 点击目录项后短暂锁定，防止滚动检测覆盖 activeHeading 导致闪动
let _lockUntil = 0

export function useScroll() {

  // 注入 tocItems 引用（由 useDocManager 调用一次）
  function setTocItems(tocItems) {
    _tocItemsRef = tocItems
  }

  // 监听滚动：只更新进度条和 activeHeading（驱动 TOC 高亮），不操作 URL
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
    if (Date.now() < _lockUntil) return

    const content = document.querySelector('.content')
    if (!content) return

    const headings = content.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6')
    const scrollTop = content.scrollTop

    let currentId = ''
    headings.forEach(heading => {
      const rect = heading.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      const offsetTop = rect.top - contentRect.top + scrollTop

      if (offsetTop <= scrollTop + 100) {
        currentId = heading.id || findTocIdByText(getHeadingText(heading))
      }
    })

    activeHeading.value = currentId
  }

  // 滚动到指定标题
  function scrollToHeading(id) {
    activeHeading.value = id
    // 锁定 800ms，覆盖 smooth 滚动期间的检测
    _lockUntil = Date.now() + 800

    let el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    // 编辑模式下标题无 id，通过 tocItems 找到文本再匹配 DOM
    if (_tocItemsRef && _tocItemsRef.value) {
      const tocItem = _tocItemsRef.value.find(t => t.id === id)
      if (tocItem) {
        const content = document.querySelector('.content')
        if (!content) return
        const headings = content.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6')
        for (const heading of headings) {
          if (getHeadingText(heading) === tocItem.text) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
            return
          }
        }
      }
    }
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
    setTocItems
  }
}
