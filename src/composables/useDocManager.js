import { ref, computed, watch, nextTick } from 'vue'
import * as docService from '../services/DocService.js'
import { useMarkdown } from './useMarkdown.js'
import { useSearch } from './useSearch.js'
import { useScroll } from './useScroll.js'
import { useMobile } from './useMobile.js'
import { findDoc, findFirstDoc, findReadmeDoc, findDocByHash, expandParents, flattenDocsList, expandAll, collapseAll } from './useDocTree.js'
import { stripOrderPrefix } from './useDocHash.js'

// 等待内容区域图片加载完成
async function waitForContentImages(timeoutMs = 3000) {
  const images = document.querySelectorAll('.markdown-content img')
  const pending = [...images].filter(img => !img.complete)
  if (!pending.length) return
  await Promise.race([
    Promise.all(pending.map(img => new Promise(r => { img.onload = img.onerror = r }))),
    new Promise(r => setTimeout(r, timeoutMs))
  ])
}

export function useDocManager() {
  // 文档状态
  const docsList = ref([])
  const currentDoc = ref('')
  const hasInitialPath = window.location.pathname.replace(/^\//, '') !== ''
  const showWelcome = ref(!hasInitialPath)
  const lastModified = ref('')

  // 编辑模式（从 sessionStorage 恢复）
  const editMode = ref(sessionStorage.getItem('editMode') === 'true')
  const rawMarkdown = ref('')
  const currentDocFilePath = ref('')

  // composables
  const { htmlContent, tocItems, renderMarkdown, extractTOCFromMarkdown, docHash } = useMarkdown()
  const { buildIndex } = useSearch()
  const {
    scrollProgress, showBackToTop, activeHeading,
    handleScroll: _handleScroll,
    scrollToHeading: _scrollToHeading,
    scrollToTop,
    setTocItems
  } = useScroll()
  const { isMobile, mobileDrawerOpen } = useMobile()

  setTocItems(tocItems)

  // ===== 滚动 & 历史 =====
  function getScrollTop() {
    const el = document.querySelector('.content')
    return el ? el.scrollTop : 0
  }

  function makeState(scrollTop) {
    return { scrollTop: scrollTop ?? getScrollTop() }
  }

  function handleScroll(e) {
    _handleScroll(e)
  }

  function scrollToHeading(id, { push = false } = {}) {
    if (push && currentDoc.value) {
      history.replaceState(makeState(), '', window.location.href)
    }
    _scrollToHeading(id)
    if (currentDoc.value) {
      const url = `/${docHash(currentDoc.value)}#${id}`
      if (push) {
        history.pushState(makeState(), '', url)
      } else {
        history.replaceState(makeState(), '', url)
      }
    }
  }

  // ===== 文档列表加载 =====
  async function loadDocsList() {
    docsList.value = await docService.fetchDocsList()
    restoreExpandedState()
    buildIndex(docsList.value)
  }

  // ===== 导航 =====
  function goHome({ isPopstate = false } = {}) {
    currentDoc.value = ''
    showWelcome.value = true
    htmlContent.value = ''
    tocItems.value = []
    editMode.value = false
    lastModified.value = ''
    sessionStorage.setItem('editMode', 'false')
    document.title = 'md2ui'
    if (!isPopstate) {
      history.replaceState(makeState(), '', window.location.href)
      history.pushState(makeState(0), '', '/')
    }
    if (isMobile.value) mobileDrawerOpen.value = false
  }

  async function loadDoc(key, { replace = false, anchor = '', keepState = false } = {}) {
    currentDoc.value = key
    showWelcome.value = false
    lastContentHash = ''
    docService.resetContentEtag()
    const hash = docHash(key)
    const url = anchor ? `/${hash}#${anchor}` : `/${hash}`
    if (replace) {
      if (!keepState) history.replaceState(makeState(0), '', url)
    } else {
      history.replaceState(makeState(), '', window.location.href)
      history.pushState(makeState(0), '', url)
    }
    const doc = findDoc(docsList.value, key)
    if (!doc) return
    try {
      const response = await fetch(doc.path)
      if (response.ok) {
        const content = await response.text()
        rawMarkdown.value = content
        // 捕获最后修改时间
        const lm = response.headers.get('x-last-modified')
        lastModified.value = lm || ''
        // 提取文件路径供轮询使用
        currentDocFilePath.value = doc.path.replace(/^\/@user-docs\//, '')
        if (editMode.value) {
          extractTOCFromMarkdown(content, tocItems)
        } else {
          await renderMarkdown(content, key, docsList.value)
        }
        // 切换文档时清空 activeHeading，避免残留旧文档的高亮状态
        activeHeading.value = ''
        const contentEl = document.querySelector('.content')
        if (contentEl) contentEl.scrollTop = 0
        // 动态更新页面标题（SEO + 浏览器标签页）
        const docTitle = findDoc(docsList.value, key)?.label || ''
        document.title = docTitle ? `${docTitle} - md2ui` : 'md2ui'
      }
    } catch (error) {
      console.error('加载文档失败:', error)
    }
  }

  function loadFirstDoc() {
    const first = findFirstDoc(docsList.value)
    if (first) loadDoc(first.key)
  }

  function handleDocSelect(key) {
    loadDoc(key)
    if (isMobile.value) mobileDrawerOpen.value = false
  }

  // ===== 文件夹操作 =====
  function toggleFolder(item) { item.expanded = !item.expanded; saveExpandedState() }
  function onExpandAll() { expandAll(docsList.value); saveExpandedState() }
  function onCollapseAll() { collapseAll(docsList.value); saveExpandedState() }

  function saveExpandedState() {
    const expanded = []
    function collect(items) {
      for (const item of items) {
        if (item.type === 'folder') {
          if (item.expanded) expanded.push(item.key)
          if (item.children) collect(item.children)
        }
      }
    }
    collect(docsList.value)
    sessionStorage.setItem('expandedFolders', JSON.stringify(expanded))
  }

  function restoreExpandedState() {
    const raw = sessionStorage.getItem('expandedFolders')
    if (!raw) return
    try {
      const expanded = new Set(JSON.parse(raw))
      function apply(items) {
        for (const item of items) {
          if (item.type === 'folder') {
            if (expanded.has(item.key)) item.expanded = true
            if (item.children) apply(item.children)
          }
        }
      }
      apply(docsList.value)
    } catch { /* ignore */ }
  }

  // ===== 内容区点击处理 =====
  function handleContentClick(event, { onZoom }) {
    const target = event.target
    const link = target.closest('a')
    if (link) {
      const docKey = link.dataset.docKey
      if (docKey) {
        event.preventDefault()
        const anchor = link.dataset.anchor || ''
        expandParents(docsList.value, docKey)
        saveExpandedState()
        loadDoc(docKey).then(async () => {
          if (anchor) { await nextTick(); await waitForContentImages(); scrollToHeading(anchor) }
        })
        return
      }
      if (link.dataset.anchor && !docKey) {
        event.preventDefault()
        scrollToHeading(link.dataset.anchor, { push: true })
        return
      }
      return
    }
    const isImg = target.tagName === 'IMG' && target.classList.contains('zoomable-image')
    const mermaidEl = target.closest('.mermaid') || target.closest('.mermaid-svg')
    const isMermaid = mermaidEl && mermaidEl.classList.contains('zoomable-image')
    if (isImg || isMermaid) {
      const container = document.querySelector('.markdown-content')
      if (!container) return
      const allZoomable = [...container.querySelectorAll('.zoomable-image')]
      const images = allZoomable.map(el => {
        if (el.tagName === 'IMG') {
          return `<img src="${el.src}" alt="${el.alt || ''}" style="max-width: 100%; height: auto;" />`
        }
        const clone = el.cloneNode(true)
        clone.querySelectorAll('.mermaid-copy-btn, .image-copy-btn').forEach(btn => btn.remove())
        return clone.innerHTML
      })
      const clickedEl = isImg ? target : mermaidEl
      const index = allZoomable.indexOf(clickedEl)
      onZoom({ images, index: Math.max(index, 0) })
    }
  }

  // ===== 计算属性 =====
  const currentDocTitle = computed(() => {
    if (!currentDoc.value) return '文档'
    const doc = findDoc(docsList.value, currentDoc.value)
    return doc?.label || '文档'
  })

  // 扁平化文档列表（缓存，供 prevDoc / nextDoc 共享）
  const flatList = computed(() => flattenDocsList(docsList.value))

  const prevDoc = computed(() => {
    if (!currentDoc.value) return null
    const idx = flatList.value.findIndex(d => d.key === currentDoc.value)
    return idx > 0 ? flatList.value[idx - 1] : null
  })

  const nextDoc = computed(() => {
    if (!currentDoc.value) return null
    const idx = flatList.value.findIndex(d => d.key === currentDoc.value)
    return idx >= 0 && idx < flatList.value.length - 1 ? flatList.value[idx + 1] : null
  })

  function handleSearchSelect(key) {
    expandParents(docsList.value, key)
    saveExpandedState()
    loadDoc(key)
  }

  // ===== 编辑模式 =====
  function toggleEditMode() {
    editMode.value = !editMode.value
    sessionStorage.setItem('editMode', editMode.value)
  }

  watch(editMode, async (newVal, oldVal) => {
    if (oldVal && !newVal && rawMarkdown.value && currentDoc.value) {
      await renderMarkdown(rawMarkdown.value, currentDoc.value, docsList.value)
    }
    if (newVal && rawMarkdown.value) {
      extractTOCFromMarkdown(rawMarkdown.value, tocItems)
    }
  })

  watch(rawMarkdown, (md) => {
    if (editMode.value && md) {
      extractTOCFromMarkdown(md, tocItems)
    }
  })

  // ===== 轮询回调（供 useFileWatcher 调用） =====

  // 树结构指纹，快速判断是否有变化
  function treeFingerprint(items) {
    const parts = []
    for (const item of items) {
      parts.push(item.key)
      if (item.type === 'folder' && item.children) {
        parts.push('{', treeFingerprint(item.children), '}')
      }
    }
    return parts.join(',')
  }

  function getExpandedKeys(items) {
    const keys = new Set()
    for (const item of items) {
      if (item.type === 'folder') {
        if (item.expanded) keys.add(item.key)
        if (item.children) for (const k of getExpandedKeys(item.children)) keys.add(k)
      }
    }
    return keys
  }

  function applyExpandedState(items, expandedKeys) {
    for (const item of items) {
      if (item.type === 'folder') {
        if (expandedKeys.has(item.key)) item.expanded = true
        if (item.children) applyExpandedState(item.children, expandedKeys)
      }
    }
  }

  // 刷新文档列表（轮询回调 或 手动调用）
  async function reloadDocsList(newTree) {
    if (!newTree) {
      // 手动调用（创建/删除/重命名后），强制拉取最新
      docService.resetListEtag()
      newTree = await docService.fetchDocsList()
    }
    // 结构没变就跳过
    if (docsList.value.length > 0 && treeFingerprint(docsList.value) === treeFingerprint(newTree)) {
      return
    }
    // 保存展开状态 → 替换 → 恢复
    const expandedKeys = getExpandedKeys(docsList.value)
    docsList.value = newTree
    applyExpandedState(docsList.value, expandedKeys)
    if (currentDoc.value) expandParents(docsList.value, currentDoc.value)
    buildIndex(docsList.value)
    saveExpandedState()
  }

  // 刷新当前文档内容（轮询回调）
  let lastContentHash = ''
  async function reloadCurrentDoc(content) {
    if (!currentDoc.value) return
    // 哈希比对，内容没变就跳过
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
    }
    const hashStr = String(hash)
    if (hashStr === lastContentHash) return
    lastContentHash = hashStr
    rawMarkdown.value = content
    // 编辑模式下只更新 rawMarkdown（编辑器组件会自行比对内容决定是否刷新）
    if (editMode.value) return
    await renderMarkdown(content, currentDoc.value, docsList.value)
  }

  // ===== 写操作 =====
  async function saveDocContent({ path: filePath, content }) {
    try {
      const ok = await docService.saveDoc(filePath, content)
      if (ok) {
        rawMarkdown.value = content
        if (!editMode.value) {
          await renderMarkdown(content, currentDoc.value, docsList.value)
        }
        return true
      }
      return false
    } catch (e) {
      console.error('保存失败:', e)
      return false
    }
  }

  function getCurrentDocPath() {
    return currentDocFilePath.value
  }

  // ===== URL 路由 =====
  async function loadFromUrl() {
    const pathname = window.location.pathname.replace(/^\//, '')
    const anchor = window.location.hash.replace('#', '')
    const savedScroll = history.state?.scrollTop
    if (!pathname) {
      if (currentDoc.value) {
        goHome({ isPopstate: true })
      } else if (docsList.value.length === 0) {
        showWelcome.value = false
        renderMarkdown('# 当前目录没有 Markdown 文档\n\n请在当前目录下添加 `.md` 文件，然后刷新页面。')
      } else {
        const readme = findReadmeDoc(docsList.value)
        const target = readme || findFirstDoc(docsList.value)
        if (target) {
          expandParents(docsList.value, target.key)
          await loadDoc(target.key, { replace: true })
        }
      }
      return
    }
    const doc = findDocByHash(docsList.value, pathname, docHash)
    if (!doc) return
    if (doc.key === currentDoc.value) {
      await nextTick()
      if (savedScroll != null) {
        const contentEl = document.querySelector('.content')
        if (contentEl) contentEl.scrollTo({ top: savedScroll, behavior: 'smooth' })
      } else if (anchor) {
        _scrollToHeading(decodeURIComponent(anchor))
      } else {
        const contentEl = document.querySelector('.content')
        if (contentEl) contentEl.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }
    expandParents(docsList.value, doc.key)
    saveExpandedState()
    await loadDoc(doc.key, { replace: true, keepState: savedScroll != null, anchor: anchor ? decodeURIComponent(anchor) : '' })
    if (savedScroll != null) {
      await nextTick()
      const contentEl = document.querySelector('.content')
      if (contentEl) contentEl.scrollTo({ top: savedScroll })
    } else if (anchor) {
      await nextTick(); await waitForContentImages(); _scrollToHeading(decodeURIComponent(anchor))
    }
  }

  // ===== 文档管理操作 =====
  async function createDoc({ parentKey, name, type }) {
    const relativePath = parentKey ? `${parentKey}/${name}` : name
    const apiPath = type === 'file' ? `${relativePath}.md` : relativePath
    try {
      await docService.createDoc(apiPath, type)
      await reloadDocsList()
      if (parentKey) expandParents(docsList.value, relativePath)
      if (type === 'file') await loadDoc(relativePath)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function renameDoc(item, newName) {
    const parts = item.key.split('/')
    parts[parts.length - 1] = newName
    const newKey = parts.join('/')
    const oldPath = item.type === 'file' ? `${item.key}.md` : item.key
    const newPath = item.type === 'file' ? `${newKey}.md` : newKey
    try {
      await docService.renameDoc(oldPath, newPath)
      const wasCurrentDoc = item.type === 'file' && item.key === currentDoc.value
      const wasInFolder = item.type === 'folder' && currentDoc.value.startsWith(item.key + '/')
      await reloadDocsList()
      if (wasCurrentDoc) {
        expandParents(docsList.value, newKey)
        await loadDoc(newKey, { replace: true })
      }
      if (wasInFolder) {
        const newDocKey = currentDoc.value.replace(item.key + '/', newKey + '/')
        expandParents(docsList.value, newDocKey)
        await loadDoc(newDocKey, { replace: true })
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  async function deleteDoc(item) {
    const apiPath = item.type === 'file' ? `${item.key}.md` : item.key
    try {
      await docService.deleteDoc(apiPath)
      if (item.type === 'file' && item.key === currentDoc.value) goHome()
      if (item.type === 'folder' && currentDoc.value.startsWith(item.key + '/')) goHome()
      await reloadDocsList()
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e.message }
    }
  }

  // ===== 拖拽排序 =====
  function calcPadWidth(count) { return count < 100 ? 2 : String(count - 1).length }
  function orderPrefix(index, padWidth) { return String(index).padStart(padWidth, '0') }
  function stripPrefix(name) { return name.replace(/^\d+-/, '') }

  function collectReorderItems(items, parentPath = '') {
    const result = []
    const padWidth = calcPadWidth(items.length)
    items.forEach((item, index) => {
      const prefix = orderPrefix(index, padWidth)
      const pureName = stripPrefix(item.label || item.key.split('/').pop())
      const newName = `${prefix}-${pureName}`
      const oldName = item.key.split('/').pop()
      const oldFsName = item.type === 'file' ? `${oldName}.md` : oldName
      const newFsName = item.type === 'file' ? `${newName}.md` : newName
      const oldPath = parentPath ? `${parentPath}/${oldFsName}` : oldFsName
      const newPath = parentPath ? `${parentPath}/${newFsName}` : newFsName
      if (oldPath !== newPath) result.push({ oldPath, newPath })
    })
    return result
  }

  function collectAllReorderLevels(items, parentPath = '') {
    const levels = []
    items.forEach((item) => {
      if (item.type === 'folder' && item.children) {
        const folderPath = parentPath ? `${parentPath}/${item.key.split('/').pop()}` : item.key.split('/').pop()
        levels.push(...collectAllReorderLevels(item.children, folderPath))
      }
    })
    const currentLevelItems = collectReorderItems(items, parentPath)
    if (currentLevelItems.length > 0) levels.push(currentLevelItems)
    return levels
  }

  async function reorderDocs() {
    const levels = collectAllReorderLevels(docsList.value)
    if (levels.length === 0) return { ok: true }
    const currentPureName = currentDoc.value ? stripOrderPrefix(currentDoc.value) : ''
    try {
      for (const levelItems of levels) {
        if (levelItems.length === 0) continue
        await docService.reorderDocs(levelItems)
      }
      await reloadDocsList()
      if (currentPureName) {
        const flat = flattenDocsList(docsList.value)
        const match = flat.find(d => stripOrderPrefix(d.key) === currentPureName)
        if (match) {
          expandParents(docsList.value, match.key)
          await loadDoc(match.key, { replace: true })
        }
      }
      return { ok: true }
    } catch (e) {
      console.error('重编号失败:', e)
      return { ok: false, message: e.message }
    }
  }

  // ===== 导出 =====
  return {
    docsList, currentDoc, currentDocTitle, showWelcome, htmlContent, tocItems,
    editMode, rawMarkdown, currentDocFilePath, lastModified,
    scrollProgress, showBackToTop, activeHeading,
    handleScroll, scrollToHeading, scrollToTop,
    loadDocsList, loadFromUrl, goHome, loadDoc, loadFirstDoc,
    handleDocSelect, handleContentClick, handleSearchSelect,
    toggleEditMode, reloadDocsList, reloadCurrentDoc,
    saveDoc: saveDocContent, getCurrentDocPath,
    toggleFolder, onExpandAll, onCollapseAll,
    prevDoc, nextDoc,
    createDoc, deleteDoc, renameDoc, reorderDocs,
    docHash
  }
}
