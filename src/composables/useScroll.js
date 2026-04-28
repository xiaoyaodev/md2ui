import { ref } from 'vue'

// 单例状态，确保多处调用共享同一份
const scrollProgress = ref(0)
const showBackToTop = ref(false)
const activeHeading = ref('')

// 外部注入的 tocItems 引用，用于编辑模式下通过文本匹配标题
let _tocItemsRef = null

// 节流定时器，避免滚动时频繁查询 DOM
let _activeHeadingTimer = null

// URL 更新回调（由 useDocManager 注入）
let _onActiveHeadingChange = null

// debounce 定时器，滚动停止后才更新 URL
let _urlDebounceTimer = null

// 标记程序化滚动（点击 TOC），期间跳过 debounce URL 更新
let _isProgrammatic = false

export function useScroll() {

  // 注入 tocItems 引用（由 useDocManager 调用一次）
  function setTocItems(tocItems) {
    _tocItemsRef = tocItems
  }

  // 注入 URL 更新回调
  function onActiveHeadingChange(fn) {
    _onActiveHeadingChange = fn
  }

  // 监听滚动：实时更新进度条和 activeHeading，debounce 更新 URL
  function handleScroll(e) {
    const element = e.target
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight - element.clientHeight

    if (scrollHeight > 0) {
      scrollProgress.value = Math.round((scrollTop / scrollHeight) * 100)
      showBackToTop.value = scrollTop > 300
    }

    // 节流更新 activeHeading（驱动 TOC 高亮）
    if (!_activeHeadingTimer) {
      _activeHeadingTimer = setTimeout(() => {
        _activeHeadingTimer = null
        updateActiveHeading()
      }, 80)
    }

    // debounce 更新 URL：滚动停止 300ms 后才写，程序化滚动期间跳过
    if (!_isProgrammatic && _onActiveHeadingChange) {
      if (_urlDebounceTimer) clearTimeout(_urlDebounceTimer)
      _urlDebounceTimer = setTimeout(() => {
        _urlDebounceTimer = null
        if (activeHeading.value) {
          _onActiveHeadingChange(activeHeading.value)
        }
      }, 300)
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
    // 标记程序化滚动，阻止 debounce 更新 URL（由调用方直接管理 URL）
    _isProgrammatic = true
    if (_urlDebounceTimer) { clearTimeout(_urlDebounceTimer); _urlDebounceTimer = null }

    activeHeading.value = id

    // 优先通过 id 定位
    let el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      scheduleUnlock()
      return
    }
    // 编辑模式下标题无 id，通过 tocItems 找到文本再匹配 DOM
    if (_tocItemsRef && _tocItemsRef.value) {
      const tocItem = _tocItemsRef.value.find(t => t.id === id)
      if (tocItem) {
        const content = document.querySelector('.content')
        if (!content) { _isProgrammatic = false; return }
        const headings = content.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6')
        for (const heading of headings) {
          if (getHeadingText(heading) === tocItem.text) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
            scheduleUnlock()
            return
          }
        }
      }
    }
    _isProgrammatic = false
  }

  // smooth 滚动结束后解除程序化标记（监听滚动停止）
  let _unlockTimer = null
  function scheduleUnlock() {
    // 用 scroll 事件的间隔来检测滚动停止
    const content = document.querySelector('.content')
    if (!content) { _isProgrammatic = false; return }
    const onScroll = () => {
      if (_unlockTimer) clearTimeout(_unlockTimer)
      _unlockTimer = setTimeout(() => {
        content.removeEventListener('scroll', onScroll)
        _isProgrammatic = false
      }, 150)
    }
    content.addEventListener('scroll', onScroll)
    // 兜底：最多 1.5s 后解锁
    setTimeout(() => {
      content.removeEventListener('scroll', onScroll)
      _isProgrammatic = false
    }, 1500)
  }

  // 返回顶部
  function scrollToTop() {
    const content = document.querySelector('.content')
    if (content) {
      content.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // 暂停 debounce URL 更新（文档切换时使用）
  function pauseUrlUpdate() {
    _isProgrammatic = true
    if (_urlDebounceTimer) { clearTimeout(_urlDebounceTimer); _urlDebounceTimer = null }
  }

  function resumeUrlUpdate() {
    _isProgrammatic = false
  }

  return {
    scrollProgress,
    showBackToTop,
    activeHeading,
    handleScroll,
    scrollToHeading,
    scrollToTop,
    setTocItems,
    onActiveHeadingChange,
    pauseUrlUpdate,
    resumeUrlUpdate
  }
}
