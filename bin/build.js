#!/usr/bin/env node

/**
 * md2ui build - SSG 静态构建
 * 
 * 流程：
 * 1. 先执行 vite build 生成 SPA 产物
 * 2. 扫描所有 .md 文件，预渲染为静态 HTML
 * 3. 生成搜索索引 JSON
 * 4. 产物可直接部署到 CDN / GitHub Pages / Vercel
 */

import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { marked } from 'marked'
import hljs from 'highlight.js'
import GithubSlugger from 'github-slugger'

let katex
try {
  katex = (await import('katex')).default
} catch {
  katex = null
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgRoot = resolve(__dirname, '..')

// 用户执行命令的目录
const userDir = process.cwd()

// 默认配置
const defaultConfig = {
  title: 'md2ui',
  port: 3000,
  folderExpanded: false,
  github: '',
  footer: '',
  themeColor: '#3eaf7c',
  outDir: 'dist'
}

// ===== 工具函数 =====

// base62 字符集（与 useMarkdown.js 保持一致）
const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function fnv1a64(str) {
  let h1 = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193) >>> 0
  }
  let h2 = 0x050c5d1f >>> 0
  for (let i = 0; i < str.length; i++) {
    h2 ^= str.charCodeAt(i)
    h2 = Math.imul(h2, 0x01000193) >>> 0
  }
  return [h1, h2]
}

function toBase62(h1, h2) {
  const num = (BigInt(h1) << 32n) | BigInt(h2)
  let n = num
  let result = ''
  while (n > 0n && result.length < 12) {
    result = BASE62[Number(n % 62n)] + result
    n = n / 62n
  }
  return result.padStart(8, '0').slice(0, 8)
}

function docHash(key) {
  const [h1, h2] = fnv1a64(key)
  return toBase62(h1, h2)
}


// 加载用户配置文件
async function loadUserConfig() {
  const jsPath = resolve(userDir, 'md2ui.config.js')
  if (fs.existsSync(jsPath)) {
    try {
      const mod = await import(pathToFileURL(jsPath).href)
      return mod.default || mod
    } catch (e) {
      console.warn('  配置文件加载失败:', e.message)
    }
  }
  const jsonPath = resolve(userDir, '.md2uirc.json')
  if (fs.existsSync(jsonPath)) {
    try {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    } catch (e) {
      console.warn('  配置文件加载失败:', e.message)
    }
  }
  return {}
}

// 扫描目录下的 md 文件（与 md2ui.js 保持一致）
function scanDocs(dir, basePath = '', level = 0, folderExpanded = false) {
  const items = []
  if (!fs.existsSync(dir)) return items

  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.name !== 'node_modules' && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name)
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.isDirectory()) {
      const children = scanDocs(fullPath, relativePath, level + 1, folderExpanded)
      if (children.length > 0) {
        const match = entry.name.match(/^(\d+)-(.+)$/)
        items.push({
          key: relativePath,
          label: match ? match[2] : entry.name,
          order: match ? parseInt(match[1]) : 999,
          type: 'folder',
          level,
          expanded: folderExpanded,
          children
        })
      }
    } else if (entry.name.endsWith('.md')) {
      const match = entry.name.match(/^(\d+)-(.+)\.md$/)
      const label = match ? match[2] : entry.name.replace(/\.md$/, '')
      items.push({
        key: relativePath.replace(/\.md$/, ''),
        label,
        order: match ? parseInt(match[1]) : 999,
        type: 'file',
        level,
        path: resolve(dir, entry.name),
        relativePath
      })
    }
  }

  items.sort((a, b) => a.order - b.order)
  return items
}

// 扁平化文档树
function flattenDocs(items, result = []) {
  for (const item of items) {
    if (item.type === 'file') result.push(item)
    if (item.type === 'folder' && item.children) flattenDocs(item.children, result)
  }
  return result
}

// 解析 YAML frontmatter
function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { data: {}, content: markdown }
  const yamlStr = match[1]
  const data = {}
  for (const line of yamlStr.split('\n')) {
    const m = line.match(/^(\w+)\s*:\s*(.+)$/)
    if (!m) continue
    let val = m[2].trim()
    if (val === 'true') val = true
    else if (val === 'false') val = false
    else if (/^\d+$/.test(val)) val = parseInt(val)
    else val = val.replace(/^['"]|['"]$/g, '')
    data[m[1]] = val
  }
  return { data, content: markdown.slice(match[0].length) }
}

// 计算阅读时间
function calcReadingTime(markdown) {
  const clean = markdown
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_~`>\-|[\]()!]/g, '')
  const cnChars = (clean.match(/[\u4e00-\u9fff]/g) || []).length
  const enWords = clean.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(w => w.length > 0).length
  const totalChars = cnChars + enWords
  const minutes = Math.ceil(cnChars / 400 + enWords / 200)
  return { totalChars, minutes: Math.max(1, minutes) }
}

// ===== Markdown 渲染（SSG 版本，使用 marked + hljs，不含 Mermaid 客户端渲染） =====

async function renderMarkdownToHtml(markdown, currentDocKey, docsList) {
  const { data: frontmatter, content } = parseFrontmatter(markdown)
  const slugger = new GithubSlugger()
  const renderer = new marked.Renderer()

  // 标题渲染（SSG 版本也加上 # 锚点链接）
  renderer.heading = function(text, level) {
    const id = slugger.slug(text)
    return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>\n`
  }

  // 代码块渲染
  renderer.code = function(code, language) {
    if (language === 'mermaid') {
      const id = 'mermaid-' + Math.random().toString(36).substring(2, 11)
      return `<div class="mermaid" id="${id}">${code}</div>`
    }
    let highlighted
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(code, { language }).value
    } else {
      highlighted = hljs.highlightAuto(code).value
    }
    const langLabel = language || ''
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-lang-label">${langLabel}</span>
        <button class="copy-code-btn" title="复制代码">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span class="copy-text">复制</span>
        </button>
      </div>
      <pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>
    </div>`
  }

  // 链接渲染（SSG 版本：站内链接改写为相对路径）
  renderer.link = function(href, title, text) {
    const decoded = decodeURIComponent(href || '')
    const titleAttr = title ? ` title="${title}"` : ''

    // 站外链接
    if (/^(https?|mailto|tel):/.test(decoded)) {
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${text}</a>`
    }

    // 纯锚点
    if (decoded.startsWith('#')) {
      const anchor = decoded.slice(1)
      return `<a href="#${anchor}"${titleAttr}>${text}</a>`
    }

    // .md 文档链接
    if (decoded.endsWith('.md') || decoded.includes('.md#')) {
      const [mdPath, anchor] = decoded.includes('#') ? decoded.split('#') : [decoded, '']
      const targetKey = resolveDocKey(mdPath, currentDocKey)
      const doc = findDocInTree(docsList, targetKey)
      if (doc) {
        const hash = docHash(doc.key)
        const url = anchor ? `/${hash}.html#${anchor}` : `/${hash}.html`
        return `<a href="${url}" data-doc-key="${doc.key}"${anchor ? ` data-anchor="${anchor}"` : ''}${titleAttr}>${text}</a>`
      }
      return `<a href="javascript:void(0)" class="broken-link" title="文档未找到: ${decoded}">${text}</a>`
    }

    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${text}</a>`
  }

  marked.setOptions({ renderer, breaks: true, gfm: true, headerIds: false, mangle: false })

  // 注册 KaTeX 数学公式扩展
  if (katex) {
    marked.use({
      extensions: [
        {
          name: 'mathBlock',
          level: 'block',
          start(src) {
            const m = src.match(/(?:^|\n)\$\$/)
            return m ? m.index + (m[0].startsWith('\n') ? 1 : 0) : -1
          },
          tokenizer(src) {
            const match = src.match(/^\$\$\s*\n([\s\S]+?)\n\s*\$\$(?:\s*$|\n)/)
            if (match) return { type: 'mathBlock', raw: match[0], text: match[1].trim() }
          },
          renderer(token) {
            try {
              return `<div class="math-block">${katex.renderToString(token.text, { throwOnError: false, displayMode: true })}</div>`
            } catch { return `<pre class="math-error">${token.text}</pre>` }
          }
        },
        {
          name: 'mathInline',
          level: 'inline',
          start(src) { return src.indexOf('$') },
          tokenizer(src) {
            const match = src.match(/^\$(?!\$)((?:\\.|[^$\\])+)\$/)
            if (match) return { type: 'mathInline', raw: match[0], text: match[1].trim() }
          },
          renderer(token) {
            try {
              return katex.renderToString(token.text, { throwOnError: false, displayMode: false })
            } catch { return `<code class="math-error">${token.text}</code>` }
          }
        }
      ]
    })
  }

  let html = marked.parse(content)

  // frontmatter.title 覆盖 h1
  if (frontmatter.title) {
    const titleSlugger = new GithubSlugger()
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, `<h1 id="${titleSlugger.slug(frontmatter.title)}">${frontmatter.title}</h1>`)
  }

  // 阅读元信息
  const { totalChars, minutes } = calcReadingTime(content)
  if (totalChars > 0) {
    const metaParts = [`${totalChars} 字`, `约 ${minutes} 分钟`]
    if (frontmatter.description) metaParts.push(frontmatter.description)
    const metaHtml = `<div class="doc-meta">${metaParts.map(p => `<span class="doc-meta-item">${p}</span>`).join('<span class="doc-meta-sep">·</span>')}</div>`
    html = html.replace(/(<\/h1>)/, `$1\n${metaHtml}`)
  }

  return { html, frontmatter, title: frontmatter.title || '' }
}

// 解析相对路径
function resolveDocKey(href, currentDocKey) {
  const currentParts = currentDocKey.split('/')
  currentParts.pop()
  const linkParts = href.replace(/\.md$/, '').split('/')
  const resolved = [...currentParts]
  for (const part of linkParts) {
    if (part === '.' || part === '') continue
    if (part === '..') { resolved.pop(); continue }
    resolved.push(part)
  }
  return resolved.join('/')
}

// 在文档树中查找文档
function findDocInTree(items, key) {
  for (const item of items) {
    if (item.type === 'file' && item.key === key) return item
    if (item.type === 'folder' && item.children) {
      const found = findDocInTree(item.children, key)
      if (found) return found
    }
  }
  return null
}

// 生成搜索索引 JSON
function buildSearchIndex(docs) {
  return docs.map(doc => {
    const content = fs.readFileSync(doc.path, 'utf-8')
    const { content: cleanContent } = parseFrontmatter(content)
    return {
      id: doc.key,
      title: doc.label,
      content: cleanContent.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, '').substring(0, 5000),
      hash: docHash(doc.key)
    }
  })
}

// 生成侧边栏 HTML（递归）
function renderSidebarHtml(items, currentKey) {
  let html = ''
  for (const item of items) {
    if (item.type === 'folder') {
      const isActive = containsDoc(item, currentKey)
      html += `<div class="nav-folder-group${isActive ? ' open' : ''}">`
      html += `<div class="nav-item nav-folder level-${item.level}">`
      html += `<span class="nav-icon chevron-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>`
      html += `<span class="nav-icon folder-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>`
      html += `<span class="nav-label">${item.label}</span></div>`
      html += `<div class="nav-children">${renderSidebarHtml(item.children, currentKey)}</div></div>`
    } else {
      const hash = docHash(item.key)
      const isActive = item.key === currentKey
      html += `<a href="/${hash}.html" class="nav-item level-${item.level}${isActive ? ' active' : ''}">`
      html += `<span class="nav-icon file-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>`
      html += `<span class="nav-label">${item.label}</span></a>`
    }
  }
  return html
}

// 检查文件夹是否包含指定文档
function containsDoc(folder, key) {
  if (!folder.children) return false
  for (const item of folder.children) {
    if (item.type === 'file' && item.key === key) return true
    if (item.type === 'folder' && containsDoc(item, key)) return true
  }
  return false
}

// 生成上一篇/下一篇导航 HTML
function renderDocNav(flatDocs, currentIdx) {
  const prev = currentIdx > 0 ? flatDocs[currentIdx - 1] : null
  const next = currentIdx < flatDocs.length - 1 ? flatDocs[currentIdx + 1] : null
  if (!prev && !next) return ''
  let html = '<nav class="doc-nav">'
  if (prev) {
    html += `<a href="/${docHash(prev.key)}.html" class="doc-nav-link prev">`
    html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`
    html += `<div class="doc-nav-text"><span class="doc-nav-label">上一篇</span><span class="doc-nav-title">${prev.label}</span></div></a>`
  } else {
    html += '<div></div>'
  }
  if (next) {
    html += `<a href="/${docHash(next.key)}.html" class="doc-nav-link next">`
    html += `<div class="doc-nav-text"><span class="doc-nav-label">下一篇</span><span class="doc-nav-title">${next.label}</span></div>`
    html += `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></a>`
  }
  html += '</nav>'
  return html
}

// 生成完整的静态 HTML 页面
function generatePageHtml(options) {
  const { title, siteTitle, contentHtml, sidebarHtml, docNavHtml, cssContent, themeColor, isWelcome, description, url } = options
  const pageTitle = isWelcome ? siteTitle : `${title} - ${siteTitle}`
  const metaDesc = description || title || siteTitle
  const canonicalUrl = url || '/'

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="theme-color" content="${themeColor}">
  <!-- Open Graph -->
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:site_name" content="${siteTitle}">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${metaDesc}">
  <link rel="canonical" href="${canonicalUrl}">
  <link rel="icon" type="image/svg+xml" href="/logo.svg">
  <style>${cssContent}</style>
</head>
<body>
  <div class="container ssg-page">
    <aside class="sidebar" id="sidebar">
      <div class="logo">
        <div class="logo-group">
          <a href="/index.html" class="logo-link">${siteTitle}</a>
        </div>
        </div>
      </div>
      <nav class="nav-menu">
        <div class="nav-section"><span>文档目录</span></div>
        ${sidebarHtml}
      </nav>
    </aside>
    <main class="content">
      ${isWelcome ? generateWelcomeHtml(siteTitle) : `<article class="markdown-content">${contentHtml}</article>${docNavHtml}`}
    </main>
  </div>
  <script>${getInlineScript()}</script>
</body>
</html>`
}

// 欢迎页 HTML
function generateWelcomeHtml(siteTitle) {
  return `<div class="welcome-page">
    <div class="welcome-hero">
      <svg width="64" height="64" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="4" width="20" height="24" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
        <line x1="10" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="10" y1="16" x2="22" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <line x1="10" y1="22" x2="17" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <h1 class="welcome-title">${siteTitle}</h1>
      <p class="welcome-desc">将 Markdown 文档转换为美观易读的网页</p>
    </div>
  </div>`
}

// 内联 JS：主题切换 + 侧边栏折叠 + 代码复制 + Mermaid 延迟渲染
function getInlineScript() {
  return `
// 侧边栏折叠
document.querySelectorAll('.nav-folder-group').forEach(function(g){
  g.querySelector('.nav-folder').addEventListener('click',function(){g.classList.toggle('open')})});

// 代码复制
document.querySelectorAll('.copy-code-btn').forEach(function(btn){
  btn.addEventListener('click',function(){
    var code=btn.closest('.code-block-wrapper').querySelector('code');
    if(!code)return;
    navigator.clipboard.writeText(code.textContent).then(function(){
      var t=btn.querySelector('.copy-text');t.textContent='已复制';
      btn.classList.add('copied');
      setTimeout(function(){t.textContent='复制';btn.classList.remove('copied')},2000)
    })
  })
});

// 移动端菜单
var sidebar=document.getElementById('sidebar'),overlay=document.getElementById('drawer-overlay');
function openDrawer(){if(sidebar){sidebar.classList.add('drawer-open');if(overlay)overlay.style.display='block'}}
function closeDrawer(){if(sidebar){sidebar.classList.remove('drawer-open');if(overlay)overlay.style.display='none'}}

// Mermaid 延迟渲染
(function(){var els=document.querySelectorAll('.mermaid');
if(els.length===0)return;
var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
s.onload=function(){mermaid.initialize({startOnLoad:false,theme:'base',themeVariables:{primaryColor:'#e8eaf6',primaryTextColor:'#37474f',primaryBorderColor:'#7986cb',lineColor:'#90a4ae',textColor:'#455a64',secondaryColor:'#f3e5f5',secondaryBorderColor:'#ba68c8',tertiaryColor:'#e0f7fa',tertiaryBorderColor:'#4dd0e1',fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',fontSize:'14px',actorBkg:'#e8eaf6',actorBorder:'#7986cb',signalColor:'#5c6bc0',sectionBkgColor:'#e8eaf6',altSectionBkgColor:'#f3e5f5',taskBkgColor:'#7986cb',taskTextColor:'#ffffff',activeTaskBkgColor:'#5c6bc0',doneTaskBkgColor:'#9fa8da',pie1:'#7986cb',pie2:'#ba68c8',pie3:'#4dd0e1',pie4:'#ffb74d',pie5:'#a1887f',mainBkg:'#e8eaf6',background:'#ffffff'}});
els.forEach(function(el){var id=el.id;var code=el.textContent;
mermaid.render(id+'-svg',code).then(function(r){el.innerHTML=r.svg;el.classList.add('zoomable-image');el.style.cursor='zoom-in'})
.catch(function(e){el.innerHTML='<pre class=\"mermaid-error\">图表渲染失败\\n'+e.message+'</pre>'})})};
document.head.appendChild(s)})();

`
}

// 生成 SSG 专用 CSS（从 style.css 读取 + 补充 SSG 特有样式）
function getSsgCss(pkgRoot) {
  let css = fs.readFileSync(resolve(pkgRoot, 'src/style.css'), 'utf-8')
  // 尝试加载 KaTeX CSS
  try {
    const katexCssPath = resolve(pkgRoot, 'node_modules/katex/dist/katex.min.css')
    if (fs.existsSync(katexCssPath)) {
      css += '\n' + fs.readFileSync(katexCssPath, 'utf-8')
    }
  } catch { /* KaTeX CSS 不可用时忽略 */ }
  // 追加 SSG 特有样式
  css += `
/* SSG 特有样式 */
.ssg-page .sidebar { width: 280px; }
.ssg-page .logo-link {
  font-size: 16px; font-weight: 700; color: var(--color-text);
  text-decoration: none; letter-spacing: -0.02em;
}
.ssg-page .logo-link:hover { color: var(--color-accent); }
.nav-folder-group .nav-children { display: none; }
.nav-folder-group.open .nav-children { display: block; }
.nav-folder-group.open > .nav-folder .chevron-icon svg { transform: rotate(90deg); }
.nav-folder-group .chevron-icon svg { transition: transform 0.15s; }
.ssg-page .nav-item { text-decoration: none; }
.ssg-page .welcome-page {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 100%; padding: 64px 32px;
}
.ssg-page .welcome-hero {
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  color: var(--color-accent);
}
.ssg-page .welcome-title {
  font-size: 40px; font-weight: 700; color: var(--color-text);
  border: none; padding: 0; margin: 0;
}
.ssg-page .welcome-desc { font-size: 16px; color: var(--color-text-secondary); margin: 0; }
/* 移动端响应式 */
@media (max-width: 768px) {
  .ssg-page .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0; width: 280px !important;
    z-index: 600; transform: translateX(-100%); transition: transform 0.25s ease;
  }
  .ssg-page .sidebar.drawer-open { transform: translateX(0); }
}
`
  return css
}



// ===== 主构建流程 =====
async function build() {
  // 解析位置参数：md2ui build [dir]
  const args = process.argv.slice(3)
  let targetDir = null
  for (const arg of args) {
    if (!arg.startsWith('-')) {
      targetDir = arg
      break
    }
  }
  const scanDir = targetDir ? resolve(userDir, targetDir) : userDir

  console.log('\n  md2ui build - 静态站点生成\n')
  console.log(`  扫描目录: ${scanDir}\n`)

  // 加载配置
  const userConfig = await loadUserConfig()
  const siteConfig = { ...defaultConfig, ...userConfig }
  const outDir = resolve(userDir, siteConfig.outDir || 'dist')

  // 扫描文档
  const docsList = scanDocs(scanDir, '', 0, siteConfig.folderExpanded)
  const flatDocs = flattenDocs(docsList)

  if (flatDocs.length === 0) {
    console.log('  当前目录下没有找到 Markdown 文件\n')
    process.exit(1)
  }

  console.log(`  找到 ${flatDocs.length} 个文档\n`)

  // 清理输出目录
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true })
  }
  fs.mkdirSync(outDir, { recursive: true })

  // 读取 CSS
  const cssContent = getSsgCss(pkgRoot)

  // 复制 logo
  const logoSrc = resolve(pkgRoot, 'public/logo.svg')
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, resolve(outDir, 'logo.svg'))
  }

  // 生成每个文档的静态 HTML
  let count = 0
  for (let i = 0; i < flatDocs.length; i++) {
    const doc = flatDocs[i]
    const markdown = fs.readFileSync(doc.path, 'utf-8')
    const { html: contentHtml, title, frontmatter } = await renderMarkdownToHtml(markdown, doc.key, docsList)
    const sidebarHtml = renderSidebarHtml(docsList, doc.key)
    const docNavHtml = renderDocNav(flatDocs, i)
    const hash = docHash(doc.key)

    // 获取文件最后修改时间
    const stat = fs.statSync(doc.path)
    const mtime = stat.mtime
    const lastModifiedStr = `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')}-${String(mtime.getDate()).padStart(2, '0')} ${String(mtime.getHours()).padStart(2, '0')}:${String(mtime.getMinutes()).padStart(2, '0')}`
    const lastModifiedHtml = `<div class="doc-last-modified"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>最后更新于 ${lastModifiedStr}</span></div>`

    const pageHtml = generatePageHtml({
      title: title || doc.label,
      siteTitle: siteConfig.title,
      contentHtml,
      sidebarHtml,
      docNavHtml: lastModifiedHtml + docNavHtml,
      cssContent,
      themeColor: siteConfig.themeColor,
      isWelcome: false,
      description: frontmatter.description || '',
      url: `/${hash}.html`
    })

    fs.writeFileSync(resolve(outDir, `${hash}.html`), pageHtml, 'utf-8')
    count++
    process.stdout.write(`\r  生成页面: ${count}/${flatDocs.length}`)
  }
  console.log('')

  // 生成首页（欢迎页）
  const indexHtml = generatePageHtml({
    title: siteConfig.title,
    siteTitle: siteConfig.title,
    contentHtml: '',
    sidebarHtml: renderSidebarHtml(docsList, ''),
    docNavHtml: '',
    cssContent,
    themeColor: siteConfig.themeColor,
    isWelcome: true
  })
  fs.writeFileSync(resolve(outDir, 'index.html'), indexHtml, 'utf-8')

  // 生成搜索索引
  const searchData = buildSearchIndex(flatDocs)
  fs.writeFileSync(resolve(outDir, 'search-index.json'), JSON.stringify(searchData), 'utf-8')



  // 生成 404.html（GitHub Pages SPA fallback）
  fs.copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))

  // 生成 .nojekyll（GitHub Pages 不处理下划线文件）
  fs.writeFileSync(resolve(outDir, '.nojekyll'), '', 'utf-8')

  console.log(`\n  构建完成:`)
  console.log(`  输出目录: ${outDir}`)
  console.log(`  页面数量: ${count + 1} (含首页)`)
  console.log(`  搜索索引: search-index.json`)

  console.log(`\n  可直接部署到 GitHub Pages / Vercel / Netlify / CDN\n`)
}

build().catch(err => {
  console.error('\n  构建失败:', err.message)
  console.error(err.stack)
  process.exit(1)
})
