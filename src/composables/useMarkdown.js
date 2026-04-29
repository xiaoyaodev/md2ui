import { ref, nextTick } from 'vue'
import { marked } from 'marked'
import mermaid from 'mermaid'
import GithubSlugger from 'github-slugger'
import hljs from 'highlight.js'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// highlightjs-line-numbers.js 是 IIFE 插件，依赖全局 window.hljs
// 需先挂载 hljs 到 window，再动态加载插件
const lineNumbersReady = (typeof window !== 'undefined')
  ? (window.hljs = hljs, import('highlightjs-line-numbers.js'))
  : Promise.resolve()
import { parseFrontmatter, calcReadingTime } from './useFrontmatter.js'
import { docHash, resolveDocKey, findDocInTree } from './useDocHash.js'

// 初始化 Mermaid — 基于 base 主题自定义柔和蓝紫色调
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  // Mermaid 内置主题有这几个：default、neutral、dark、forest、base。
  securityLevel: 'loose',
  themeVariables: {
    // 基础色调
    primaryColor: '#e8eaf6',
    primaryTextColor: '#37474f',
    primaryBorderColor: '#7986cb',
    // 线条与标签
    lineColor: '#90a4ae',
    textColor: '#455a64',
    // 次要 / 第三色
    secondaryColor: '#f3e5f5',
    secondaryBorderColor: '#ba68c8',
    secondaryTextColor: '#4a148c',
    tertiaryColor: '#e0f7fa',
    tertiaryBorderColor: '#4dd0e1',
    tertiaryTextColor: '#006064',
    // 字体
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    // 节点样式
    nodeBorder: '#7986cb',
    nodeTextColor: '#37474f',
    // 序列图
    actorBkg: '#e8eaf6',
    actorBorder: '#7986cb',
    actorTextColor: '#37474f',
    signalColor: '#5c6bc0',
    signalTextColor: '#37474f',
    // 甘特图
    sectionBkgColor: '#e8eaf6',
    altSectionBkgColor: '#f3e5f5',
    taskBkgColor: '#7986cb',
    taskTextColor: '#ffffff',
    activeTaskBkgColor: '#5c6bc0',
    doneTaskBkgColor: '#9fa8da',
    // 饼图
    pie1: '#7986cb',
    pie2: '#ba68c8',
    pie3: '#4dd0e1',
    pie4: '#ffb74d',
    pie5: '#a1887f',
    // 类图
    classText: '#37474f',
    // 状态图
    labelColor: '#37474f',
    // 背景
    mainBkg: '#e8eaf6',
    nodeBkg: '#e8eaf6',
    background: '#ffffff',
  }
})

// 创建自定义渲染器，处理链接、标题锚点和 Mermaid
function createRenderer(currentDocKey, docsList) {
  const renderer = new marked.Renderer()
  const slugger = new GithubSlugger()

  // 标题渲染：使用 github-slugger 生成语义化锚点 ID，hover 显示 # 锚点链接
  renderer.heading = function(text, level) {
    const id = slugger.slug(text)
    return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" data-anchor="${id}" aria-hidden="true">#</a>${text}</h${level}>\n`
  }

  // 代码块渲染：Mermaid 图表 / 语法高亮 + 复制按钮
  renderer.code = function(code, language) {
    if (language === 'mermaid') {
      const id = 'mermaid-' + Math.random().toString(36).substr(2, 9)
      const encoded = encodeURIComponent(code)
      return `<div class="mermaid mermaid-pending" id="${id}" data-source="${encoded}"><div class="mermaid-loading">渲染中...</div></div>`
    }
    // 高亮代码
    let highlighted
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(code, { language }).value
    } else {
      highlighted = hljs.highlightAuto(code).value
    }

    const langLabel = (language || '').toUpperCase()
    // 切换行号按钮（列表图标）
    const toggleLineNumIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
    // 切换自动换行按钮（换行图标）
    const toggleWrapIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="13 16 11 18 13 20"/><path d="M3 18h4"/></svg>`
    // 切换高亮按钮（</> 文本图标）
    const toggleHighlightIcon = `<span class="code-icon-text">&lt;/&gt;</span>`
    // 复制按钮图标
    const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`

    return `<div class="code-block-wrapper" data-raw-code="${encodeURIComponent(code)}" data-lang="${language || ''}">` +
      `<div class="code-block-header">` +
        `<span class="code-lang-label">${langLabel}</span>` +
        `<div class="code-block-actions">` +
          `<button class="code-action-btn toggle-line-num-btn active" data-tooltip="隐藏行号">${toggleLineNumIcon}</button>` +
          `<button class="code-action-btn toggle-wrap-btn" data-tooltip="自动换行">${toggleWrapIcon}</button>` +
          `<button class="code-action-btn toggle-highlight-btn active" data-tooltip="关闭高亮">${toggleHighlightIcon}</button>` +
          `<button class="code-action-btn copy-code-btn" data-tooltip="复制代码">${copyIcon}<span class="copy-text">复制</span></button>` +
        `</div>` +
      `</div>` +
      `<div class="code-block-body"><pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre></div>` +
    `</div>`
  }

  // 图片渲染：将相对路径转换为 /@user-docs/ 绝对路径
  renderer.image = function(href, title, text) {
    if (href && !/^(https?:|data:|\/|@)/.test(href)) {
      // 相对路径图片，基于当前文档目录解析
      const docDir = currentDocKey.includes('/') ? currentDocKey.substring(0, currentDocKey.lastIndexOf('/')) : ''
      const base = docDir ? `/@user-docs/${docDir}/` : '/@user-docs/'
      href = base + href
    }
    const alt = text || ''
    const titleAttr = title ? ` title="${title}"` : ''
    return `<img src="${href}" alt="${alt}"${titleAttr} class="zoomable-image" />`
  }

  // 链接渲染：站内/站外分类处理
  renderer.link = function(href, title, text) {
    const decoded = decodeURIComponent(href || '')
    const titleAttr = title ? ` title="${title}"` : ''

    // 站外链接
    if (/^(https?|mailto|tel):/.test(decoded)) {
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${text}</a>`
    }
    // 站内纯锚点：# 后的内容已是 slug 格式，无需再次 slug（避免计数器追加后缀）
    if (decoded.startsWith('#')) {
      const anchor = decoded.slice(1)
      return `<a href="javascript:void(0)" data-anchor="${anchor}"${titleAttr}>${text}</a>`
    }
    // 站内 .md 文档链接
    if (decoded.endsWith('.md') || decoded.includes('.md#')) {
      const [mdPath, anchor] = decoded.includes('#') ? decoded.split('#') : [decoded, '']
      const targetKey = resolveDocKey(mdPath, currentDocKey)
      const doc = findDocInTree(docsList, targetKey)
      if (doc) {
        const hash = docHash(doc.key)
        // anchor 已是 slug 格式，无需再次 slug
        const url = anchor ? `/${hash}#${anchor}` : `/${hash}`
        return `<a href="${url}" data-doc-key="${doc.key}"${anchor ? ` data-anchor="${anchor}"` : ''}${titleAttr}>${text}</a>`
      }
      return `<a href="javascript:void(0)" class="broken-link" title="文档未找到: ${decoded}">${text}</a>`
    }
    // 其他相对链接
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${text}</a>`
  }

  return renderer
}

// ===== KaTeX 数学公式扩展 =====
// 为 marked 添加行内公式 $...$ 和块级公式 $$...$$ 支持

const mathInline = {
  name: 'mathInline',
  level: 'inline',
  start(src) { return src.indexOf('$') },
  tokenizer(src) {
    // 行内公式：$...$（不匹配 $$）
    const match = src.match(/^\$(?!\$)((?:\\.|[^$\\])+)\$/)
    if (match) {
      return { type: 'mathInline', raw: match[0], text: match[1].trim() }
    }
  },
  renderer(token) {
    try {
      return katex.renderToString(token.text, { throwOnError: false, displayMode: false })
    } catch {
      return `<code class="math-error">${token.text}</code>`
    }
  }
}

const mathBlock = {
  name: 'mathBlock',
  level: 'block',
  start(src) {
    // 查找行首的 $$（跳过行内代码中的 $$）
    const match = src.match(/(?:^|\n)\$\$/)
    return match ? match.index + (match[0].startsWith('\n') ? 1 : 0) : -1
  },
  tokenizer(src) {
    // 块级公式：$$ 独占一行开始，$$ 独占一行结束
    const match = src.match(/^\$\$\s*\n([\s\S]+?)\n\s*\$\$(?:\s*$|\n)/)
    if (match) {
      return { type: 'mathBlock', raw: match[0], text: match[1].trim() }
    }
  },
  renderer(token) {
    try {
      return `<div class="math-block">${katex.renderToString(token.text, { throwOnError: false, displayMode: true })}</div>`
    } catch {
      return `<pre class="math-error">${token.text}</pre>`
    }
  }
}


// ---- 后处理器 ----

// 复制按钮旁边显示提示气泡
const COPY_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

function showCopyTip(btn, success) {
  // 移除已有的 tip
  const existing = btn.parentElement?.querySelector('.copy-tip')
  if (existing) existing.remove()
  const tip = document.createElement('span')
  tip.className = 'copy-tip' + (success ? ' copy-tip-ok' : ' copy-tip-fail')
  tip.textContent = success ? '已复制' : '失败'
  // 插入到按钮后面
  btn.parentElement.insertBefore(tip, btn.nextSibling)
  btn.innerHTML = success ? CHECK_ICON : COPY_ICON
  btn.classList.toggle('copied', success)
  setTimeout(() => {
    tip.remove()
    btn.innerHTML = COPY_ICON
    btn.classList.remove('copied')
  }, 1500)
}

// 图片格式转换工具（从共享模块导入）
import { imgToPngBlob, svgToPngBlob } from '../utils/imageConverter.js'
import { getMermaidCache, setMermaidCache } from './useMermaidCache.js'

// 渲染 Mermaid 图表（并行渲染所有图表，等全部完成后返回）
async function renderMermaid() {
  await nextTick()
  const mermaidElements = document.querySelectorAll('.mermaid-pending')
  if (!mermaidElements.length) return

  // 所有图表并行渲染
  const tasks = Array.from(mermaidElements).map(async (element) => {
    const code = decodeURIComponent(element.dataset.source || '')
    if (!code) return
    const id = element.id
    try {
      // 优先使用缓存
      let svg = getMermaidCache(code)
      if (!svg) {
        const result = await mermaid.render(id + '-svg', code)
        svg = result.svg
        setMermaidCache(code, svg)
      }
      element.innerHTML = svg
      element.classList.remove('mermaid-pending')
      element.classList.add('zoomable-image')
      element.style.cursor = 'zoom-in'
      element.title = '点击放大查看'
      // 添加复制按钮
      element.style.position = 'relative'
      const copyBtn = document.createElement('button')
      copyBtn.className = 'mermaid-copy-btn image-copy-btn'
      copyBtn.title = '复制图片'
      copyBtn.innerHTML = COPY_ICON
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        e.preventDefault()
        try {
          const svgEl = element.querySelector('svg')
          if (!svgEl) return
          const blobPromise = svgToPngBlob(svgEl, 2)
          const item = new ClipboardItem({ 'image/png': blobPromise })
          await navigator.clipboard.write([item])
          showCopyTip(copyBtn, true)
        } catch (err) {
          console.warn('复制Mermaid图表失败:', err)
          showCopyTip(copyBtn, false)
        }
      })
      element.appendChild(copyBtn)
    } catch (error) {
      console.error('Mermaid 渲染失败:', error)
      const errorEl = document.getElementById(id + '-svg')
      if (errorEl) errorEl.remove()
      element.classList.remove('mermaid-pending')
      element.innerHTML = `<pre class="mermaid-error">图表渲染失败\n${error.message}</pre>`
    }
  })

  await Promise.all(tasks)
}

// 为表格添加滚动容器和工具栏按钮
function wrapTables() {
  nextTick(() => {
    const tables = document.querySelectorAll('.markdown-content table')
    tables.forEach(table => {
      // 已经处理过的跳过
      if (table.closest('.table-outer')) return

      // 代码块内的行号表格跳过
      if (table.closest('.code-block-wrapper') || table.closest('pre')) return

      // 构建结构：.table-outer > .table-toolbar + .table-wrapper > table
      const outer = document.createElement('div')
      outer.className = 'table-outer'

      // 工具栏（在 wrapper 外部，不受 overflow 影响）
      const toolbar = document.createElement('div')
      toolbar.className = 'table-toolbar'

      // SVG 图标定义
      const icons = {
        fixedWidth: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
        scrollX: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/><line x1="5" y1="5" x2="5" y2="19"/></svg>',
        fixedHeight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
        autoHeight: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 8 12 3 17 8"/><polyline points="17 16 12 21 7 16"/><line x1="12" y1="3" x2="12" y2="21"/></svg>',
        fullscreen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>'
      }

      // 按钮配置：[key, tooltip, icon, group]
      // group: 'width' 互斥组, 'height' 互斥组, null 独立
      const btnConfigs = [
        ['fixedWidth', '固定宽度', icons.fixedWidth, 'width'],
        ['scrollX', '横向滚动', icons.scrollX, 'width'],
        ['fixedHeight', '固定高度', icons.fixedHeight, 'height'],
        ['autoHeight', '适应高度', icons.autoHeight, 'height'],
        ['fullscreen', '全屏查看', icons.fullscreen, null],
      ]

      // 当前状态：默认固定宽度 + 适应高度
      const state = { width: 'fixedWidth', height: 'autoHeight' }

      const buttons = {}

      btnConfigs.forEach(([key, tooltip, icon, group]) => {
        const btn = document.createElement('button')
        btn.className = 'table-toolbar-btn'
        btn.dataset.tooltip = tooltip
        btn.innerHTML = icon

        // 默认激活状态
        if ((group === 'width' && state.width === key) || (group === 'height' && state.height === key)) {
          btn.classList.add('active')
        }

        btn.addEventListener('click', () => {
          if (key === 'fullscreen') {
            openTableFullscreen(table)
            return
          }
          // 互斥切换
          if (group) {
            state[group] = key
            // 更新同组按钮状态
            btnConfigs.filter(([, , , g]) => g === group).forEach(([k]) => {
              buttons[k].classList.toggle('active', k === key)
            })
          }
          applyTableState(outer, wrapper, table, state)
        })

        buttons[key] = btn
        toolbar.appendChild(btn)
      })

      // 滚动容器
      const wrapper = document.createElement('div')
      wrapper.className = 'table-wrapper'

      table.parentNode.insertBefore(outer, table)
      outer.appendChild(toolbar)
      outer.appendChild(wrapper)
      wrapper.appendChild(table)

      // 应用默认状态
      applyTableState(outer, wrapper, table, state)
    })
  })
}

// 根据状态应用表格样式
function applyTableState(outer, wrapper, table, state) {
  // 宽度模式
  table.classList.remove('table-fit', 'table-scroll')
  wrapper.classList.remove('table-wrapper-scroll', 'table-wrapper-fixed')
  if (state.width === 'fixedWidth') {
    table.classList.add('table-fit')
    wrapper.classList.add('table-wrapper-fixed')
  } else {
    table.classList.add('table-scroll')
    wrapper.classList.add('table-wrapper-scroll')
  }

  // 高度模式
  wrapper.classList.remove('table-wrapper-fixed-height', 'table-wrapper-auto-height')
  if (state.height === 'fixedHeight') {
    wrapper.classList.add('table-wrapper-fixed-height')
  } else {
    wrapper.classList.add('table-wrapper-auto-height')
  }
}

// 打开表格全屏弹框
function openTableFullscreen(tableEl) {
  // 创建遮罩
  const overlay = document.createElement('div')
  overlay.className = 'table-fullscreen-overlay'

  // 弹框容器
  const dialog = document.createElement('div')
  dialog.className = 'table-fullscreen-dialog'

  // 标题栏
  const header = document.createElement('div')
  header.className = 'table-fullscreen-header'

  // 统计行列信息作为标题
  const rowCount = tableEl.querySelectorAll('tr').length - 1
  const firstRow = tableEl.querySelector('tr')
  let colCount = 0
  if (firstRow) {
    for (const cell of firstRow.querySelectorAll('th, td')) {
      colCount += parseInt(cell.getAttribute('colspan') || '1', 10)
    }
  }
  const title = document.createElement('span')
  title.className = 'table-fullscreen-title'
  title.textContent = `表格预览（${rowCount} 行 × ${colCount} 列）`

  const actions = document.createElement('div')
  actions.className = 'table-fullscreen-actions'

  // 全屏/还原按钮
  const maximizeBtn = document.createElement('button')
  maximizeBtn.className = 'table-fullscreen-action-btn'
  maximizeBtn.title = '全屏'
  const iconMaximize = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>'
  const iconMinimize = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>'
  maximizeBtn.innerHTML = iconMaximize
  maximizeBtn.addEventListener('click', () => {
    const isMax = dialog.classList.toggle('is-maximized')
    maximizeBtn.innerHTML = isMax ? iconMinimize : iconMaximize
    maximizeBtn.title = isMax ? '还原' : '全屏'
    overlay.style.padding = isMax ? '0' : '24px'
  })

  // 关闭按钮
  const closeBtn = document.createElement('button')
  closeBtn.className = 'table-fullscreen-action-btn'
  closeBtn.title = '关闭'
  closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'

  actions.appendChild(maximizeBtn)
  actions.appendChild(closeBtn)
  header.appendChild(title)
  header.appendChild(actions)

  // 内容区
  const body = document.createElement('div')
  body.className = 'table-fullscreen-body'
  body.appendChild(tableEl.cloneNode(true))

  dialog.appendChild(header)
  dialog.appendChild(body)
  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  // 关闭逻辑
  const close = () => overlay.remove()
  closeBtn.addEventListener('click', close)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })
  const onKey = (e) => {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', onKey)
    }
  }
  document.addEventListener('keydown', onKey)
}

// 为图片添加放大功能
function addImageZoomHandlers() {
  nextTick(() => {
    const images = document.querySelectorAll('.markdown-content img')
    images.forEach(img => {
      // 避免重复包裹
      if (img.parentElement?.classList.contains('image-container')) return
      img.classList.add('zoomable-image')
      img.style.cursor = 'zoom-in'
      img.title = '点击放大查看'
      // 包裹容器，添加复制按钮
      const wrapper = document.createElement('span')
      wrapper.className = 'image-container'
      img.parentNode.insertBefore(wrapper, img)
      wrapper.appendChild(img)
      const copyBtn = document.createElement('button')
      copyBtn.className = 'image-copy-btn'
      copyBtn.title = '复制图片'
      copyBtn.innerHTML = COPY_ICON
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        e.preventDefault()
        try {
          // 多策略获取 PNG blob，兼容同源和跨域图片
          const blobPromise = imgToPngBlob(img.src)
          const item = new ClipboardItem({ 'image/png': blobPromise })
          await navigator.clipboard.write([item])
          showCopyTip(copyBtn, true)
        } catch (err) {
          console.warn('复制图片失败:', err)
          showCopyTip(copyBtn, false)
        }
      })
      wrapper.appendChild(copyBtn)
    })
  })
}

// 为代码块添加交互事件（复制、切换行号、切换高亮）
function addCodeBlockHandlers() {
  nextTick(async () => {
    // 等待插件加载完成
    await lineNumbersReady

    // 使用插件注入行号（table 布局，天然对齐）
    document.querySelectorAll('.code-block-body code.hljs').forEach(block => {
      hljs.lineNumbersBlock(block)
    })

    // 复制按钮
    document.querySelectorAll('.copy-code-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wrapper = btn.closest('.code-block-wrapper')
        const rawCode = decodeURIComponent(wrapper.dataset.rawCode || '')
        if (!rawCode) return
        try {
          await navigator.clipboard.writeText(rawCode)
          const textEl = btn.querySelector('.copy-text')
          textEl.textContent = '已复制'
          btn.classList.add('copied')
          setTimeout(() => {
            textEl.textContent = '复制'
            btn.classList.remove('copied')
          }, 2000)
        } catch {
          const code = wrapper.querySelector('code')
          if (code) {
            const range = document.createRange()
            range.selectNodeContents(code)
            window.getSelection().removeAllRanges()
            window.getSelection().addRange(range)
          }
        }
      })
    })

    // 切换行号（控制插件生成的 .hljs-ln 表格中行号列的显隐）
    document.querySelectorAll('.toggle-line-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrapper = btn.closest('.code-block-wrapper')
        const table = wrapper.querySelector('.hljs-ln')
        if (!table) return
        btn.classList.toggle('active')
        // 切换所有行号单元格的显隐
        table.querySelectorAll('.hljs-ln-numbers').forEach(td => {
          td.style.display = btn.classList.contains('active') ? '' : 'none'
        })
        btn.dataset.tooltip = btn.classList.contains('active') ? '隐藏行号' : '显示行号'
      })
    })

    // 切换自动换行
    document.querySelectorAll('.toggle-wrap-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrapper = btn.closest('.code-block-wrapper')
        const codeBody = wrapper.querySelector('.code-block-body')
        if (!codeBody) return
        btn.classList.toggle('active')
        codeBody.classList.toggle('word-wrap-enabled')
        btn.dataset.tooltip = btn.classList.contains('active') ? '取消换行' : '自动换行'
      })
    })

    // 切换语法高亮
    document.querySelectorAll('.toggle-highlight-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrapper = btn.closest('.code-block-wrapper')
        const codeEl = wrapper.querySelector('code')
        if (!codeEl) return
        const rawCode = decodeURIComponent(wrapper.dataset.rawCode || '')
        const lang = wrapper.dataset.lang || ''
        const isHighlighted = btn.classList.contains('active')

        if (isHighlighted) {
          // 关闭高亮：显示纯文本，移除插件表格
          codeEl.textContent = rawCode
          codeEl.className = 'code-plain'
          btn.classList.remove('active')
          btn.dataset.tooltip = '开启高亮'
        } else {
          // 开启高亮：重新渲染
          let highlighted
          if (lang && hljs.getLanguage(lang)) {
            highlighted = hljs.highlight(rawCode, { language: lang }).value
          } else {
            highlighted = hljs.highlightAuto(rawCode).value
          }
          codeEl.innerHTML = highlighted
          codeEl.className = `hljs${lang ? ` language-${lang}` : ''}`
          // 重新注入行号
          hljs.lineNumbersBlock(codeEl)
          btn.classList.add('active')
          btn.dataset.tooltip = '关闭高亮'
        }
      })
    })
  })
}

// 提取文档大纲
function extractTOC(tocItems) {
  tocItems.value = []
  nextTick(() => {
    const headings = document.querySelectorAll('.markdown-content h1, .markdown-content h2, .markdown-content h3, .markdown-content h4, .markdown-content h5, .markdown-content h6')
    headings.forEach(heading => {
      const level = parseInt(heading.tagName.substring(1))
      const clone = heading.cloneNode(true)
      clone.querySelectorAll('.heading-anchor').forEach(a => a.remove())
      const text = clone.textContent.trim()
      const id = heading.id
      if (id) {
        tocItems.value.push({ id, text, level })
      }
    })
  })
}

// 从 Markdown 文本中解析 TOC（编辑模式使用，不依赖 DOM）
function extractTOCFromMarkdown(markdown, tocItems) {
  const slugger = new GithubSlugger()
  const items = []
  const lines = markdown.split('\n')
  let inCodeBlock = false
  for (const line of lines) {
    // 跳过代码块内的内容
    if (/^```/.test(line.trim())) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      const id = slugger.slug(text)
      items.push({ id, text, level })
    }
  }
  tocItems.value = items
}

// ---- 主 composable ----

export function useMarkdown() {
  const htmlContent = ref('')
  const tocItems = ref([])

  // 渲染 Markdown，传入当前文档 key 和文档列表用于链接改写
  async function renderMarkdown(markdown, currentDocKey = '', docsList = []) {
    const { data: frontmatter, content, rawYaml } = parseFrontmatter(markdown)
    const renderer = createRenderer(currentDocKey, docsList)
    marked.use({ extensions: [mathBlock, mathInline] })
    marked.setOptions({
      renderer,
      breaks: true,
      gfm: true,
      headerIds: false,
      mangle: false
    })
    htmlContent.value = marked.parse(content)

    // frontmatter.title 覆盖第一个 h1
    if (frontmatter.title) {
      htmlContent.value = htmlContent.value.replace(
        /<h1[^>]*>[\s\S]*?<\/h1>/,
        `<h1 id="${new GithubSlugger().slug(frontmatter.title)}">${frontmatter.title}</h1>`
      )
    }

    // 在第一个 h1 后插入阅读元信息
    const { totalChars, minutes } = calcReadingTime(content)
    if (totalChars > 0) {
      const metaParts = [`${totalChars} 字`, `约 ${minutes} 分钟`]
      if (frontmatter.description) metaParts.push(frontmatter.description)
      const metaHtml = `<div class="doc-meta">${metaParts.map(p => `<span class="doc-meta-item">${p}</span>`).join('<span class="doc-meta-sep">·</span>')}</div>`
      htmlContent.value = htmlContent.value.replace(/(<\/h1>)/, `$1\n${metaHtml}`)
    }

    // 在文档顶部插入 frontmatter 代码块
    if (rawYaml) {
      const highlighted = hljs.highlight(rawYaml, { language: 'yaml' }).value
      const encodedRaw = encodeURIComponent(rawYaml)
      const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
      const frontmatterBlock =
        `<div class="code-block-wrapper frontmatter-block" data-raw-code="${encodedRaw}" data-lang="yaml">` +
          `<div class="code-block-header">` +
            `<span class="code-lang-label">FRONTMATTER</span>` +
            `<div class="code-block-actions">` +
              `<button class="code-action-btn copy-code-btn" data-tooltip="复制代码">${copyIcon}<span class="copy-text">复制</span></button>` +
            `</div>` +
          `</div>` +
          `<div class="code-block-body"><pre><code class="hljs language-yaml">${highlighted}</code></pre></div>` +
        `</div>`
      htmlContent.value = frontmatterBlock + htmlContent.value
    }

    // 后处理
    await renderMermaid()
    wrapTables()
    addImageZoomHandlers()
    addCodeBlockHandlers()
    extractTOC(tocItems)
  }

  return {
    htmlContent,
    tocItems,
    renderMarkdown,
    extractTOCFromMarkdown,
    addImageZoomHandlers,
    docHash
  }
}
