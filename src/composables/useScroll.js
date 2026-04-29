import { ref } from 'vue'

// ===== 常量 =====
// smooth 滚动锁定超时（scrollend 事件优先解锁，此值仅作兜底）
// 低性能设备或长文档上 smooth 滚动可能超过 800ms，拉长到 1500ms 确保安全
const SCROLL_LOCK_TIMEOUT_MS = 1500

// 单例状态，确保多处调用共享同一份
const scrollProgress = ref(0)
const showBackToTop = ref(false)
const activeHeading = ref('')

// 外部注入的 tocItems 引用，用于编辑模式下通过文本匹配标题
let _tocItemsRef = null

// 点击目录项后锁定，防止滚动检测覆盖 activeHeading 导致闪动
let _locked = false
let _lockTimer = null

// 标题元素缓存
let _headingsCache = null

// MutationObserver：监听 .markdown-content 子树变化，自动失效标题缓存
let _mutationObserver = null

// 标记：true 表示 activeHeading 被文档切换清空，不应同步到 URL
let _suppressHashClear = false

// IntersectionObserver 实例
let _observer = null
// 记录当前在视口中的标题（id → IntersectionObserverEntry）
const _visibleHeadings = new Map()

export function useScroll() {

  // 注入 tocItems 引用（由 useDocManager 调用一次）
  function setTocItems(tocItems) {
    _tocItemsRef = tocItems
  }

  // 重建标题缓存并重新设置 IntersectionObserver
  function rebuildHeadingsCache() {
    _headingsCache = null
    _setupMutationObserver()
    _setupObserver()
  }

  // 设置 MutationObserver 监听 .markdown-content 子树变化，自动失效标题缓存
  function _setupMutationObserver() {
    if (_mutationObserver) {
      _mutationObserver.disconnect()
      _mutationObserver = null
    }
    const container = document.querySelector('.markdown-content')
    if (!container) return
    _mutationObserver = new MutationObserver(() => {
      // 子树变化时失效缓存，下次 _getHeadings 会重新查询
      _headingsCache = null
    })
    _mutationObserver.observe(container, { childList: true, subtree: true })
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

  // 设置 IntersectionObserver 监听标题元素
  function _setupObserver() {
    // 清理旧的 observer
    if (_observer) {
      _observer.disconnect()
      _observer = null
    }
    _visibleHeadings.clear()

    const content = document.querySelector('.content')
    if (!content) return

    const headings = _getHeadings()
    if (!headings.length) return

    // rootMargin: 顶部 0px，底部 -70%，即标题进入视口上方 30% 区域时触发
    _observer = new IntersectionObserver(
      (entries) => {
        if (_locked) return

        for (const entry of entries) {
          const id = entry.target.id || findTocIdByText(getHeadingText(entry.target))
          if (!id) continue
          if (entry.isIntersecting) {
            _visibleHeadings.set(id, entry)
          } else {
            _visibleHeadings.delete(id)
          }
        }

        _resolveActiveHeading()
      },
      {
        root: content,
        // 上方全部可见，下方只保留 30%（裁掉底部 70%）
        rootMargin: '0px 0px -70% 0px',
        threshold: 0
      }
    )

    for (const heading of headings) {
      _observer.observe(heading)
    }
  }

  // 根据可见标题集合确定当前激活标题
  // 策略：取文档顺序中最后一个进入检测区域的标题
  function _resolveActiveHeading() {
    if (_locked) return

    const headings = _getHeadings()
    if (!headings.length) return

    const content = document.querySelector('.content')

    // 边界处理：滚动到底部时，强制激活最后一个标题
    if (content) {
      const atBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 10
      if (atBottom) {
        // 从后往前找最后一个有 id 的标题
        for (let i = headings.length - 1; i >= 0; i--) {
          const id = headings[i].id || findTocIdByText(getHeadingText(headings[i]))
          if (id) {
            if (!activeHeading.value) _suppressHashClear = false
            activeHeading.value = id
            return
          }
        }
      }
    }

    // 正常情况：从可见标题中取文档顺序最后一个
    if (_visibleHeadings.size > 0) {
      let lastId = ''
      for (const heading of headings) {
        const id = heading.id || findTocIdByText(getHeadingText(heading))
        if (id && _visibleHeadings.has(id)) {
          lastId = id
        }
      }
      if (lastId) {
        activeHeading.value = lastId
        return
      }
    }

    // 没有可见标题时，用传统方式兜底（滚动位置在第一个标题之前）
    if (content && content.scrollTop < 100) {
      if (activeHeading.value) _suppressHashClear = false
      activeHeading.value = ''
    }
  }

  // 监听滚动：更新进度条、返回顶部按钮，以及处理底部边界
  function handleScroll(e) {
    const element = e.target
    const scrollTop = element.scrollTop
    const scrollHeight = element.scrollHeight - element.clientHeight

    if (scrollHeight > 0) {
      scrollProgress.value = Math.round((scrollTop / scrollHeight) * 100)
      showBackToTop.value = scrollTop > 300
    }

    // 底部边界检测（IO 的 rootMargin 裁掉了底部 70%，滚到底时可能漏掉）
    if (!_locked) {
      const atBottom = scrollTop + element.clientHeight >= element.scrollHeight - 10
      if (atBottom) {
        _resolveActiveHeading()
      }
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

  // 解锁函数
  function _unlock() {
    _locked = false
    if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null }
    // 解锁后立即重新解析一次，确保 IO 状态同步
    _resolveActiveHeading()
  }

  // 滚动到指定标题
  function scrollToHeading(id) {
    activeHeading.value = id
    // 锁定，防止 smooth 滚动期间检测覆盖
    _locked = true
    if (_lockTimer) clearTimeout(_lockTimer)

    const content = document.querySelector('.content')

    // 优先用 scrollend 事件解锁，SCROLL_LOCK_TIMEOUT_MS 兜底
    if (content) {
      content.addEventListener('scrollend', _unlock, { once: true })
    }
    _lockTimer = setTimeout(() => {
      _unlock()
      if (content) content.removeEventListener('scrollend', _unlock)
    }, SCROLL_LOCK_TIMEOUT_MS)

    let el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // 触发高亮闪烁动画
      _flashHeading(el)
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
            _flashHeading(heading)
            return
          }
        }
      }
    }
  }

  // 触发标题高亮闪烁动画
  function _flashHeading(el) {
    el.classList.remove('heading-flash')
    void el.offsetWidth // 强制 reflow 重置动画
    el.classList.add('heading-flash')
    el.addEventListener('animationend', () => el.classList.remove('heading-flash'), { once: true })
  }

  // 锁定 activeHeading 一段时间（供外部在非 smooth 滚动场景使用，如页面刷新定位锚点）
  function lockHeading(id, durationMs = SCROLL_LOCK_TIMEOUT_MS) {
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
