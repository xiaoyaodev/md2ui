import { ref } from 'vue'

// 单例状态，确保多处调用共享同一份
const scrollProgress = ref(0)
const showBackToTop = ref(false)
const activeHeading = ref('')

// 外部注入的 tocItems 引用，用于编辑模式下通过文本匹配标题
let _tocItemsRef = null

export function useScroll() {

  // 注入 tocItems 引用（由 useDocManager 调用一次）
  function setTocItems(tocItems) {
    _tocItemsRef = tocItems
  }

  // 监听滚动
  function handleScroll(e) {
    const element = e.target
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight - element.clientHeight
    
    if (scrollHeight > 0) {
      scrollProgress.value = Math.round((scrollTop / scrollHeight) * 100)
      showBackToTop.value = scrollTop > 300
    }
    
    updateActiveHeading()
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
        // 优先用 id，没有 id 时通过文本匹配 tocItems
        currentId = heading.id || findTocIdByText(getHeadingText(heading))
      }
    })
    
    activeHeading.value = currentId
  }

  // 滚动到指定标题（支持编辑模式下通过文本匹配定位）
  function scrollToHeading(id) {
    // 优先通过 id 定位
    let el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      activeHeading.value = id
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
            activeHeading.value = id
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
