import { ref } from 'vue'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  ImageRun, AlignmentType, ShadingType,
  ExternalHyperlink, TableLayoutType,
  convertInchesToTwip
} from 'docx'
// 使用原生方式下载文件，兼容 Chrome / Safari / Firefox
// 使用原生方式下载文件，兼容 Chrome / Safari / Firefox
function downloadBlob(blob, fileName) {
  // 将 Blob 包装为 File 对象，Chrome 会从 File.name 获取文件名
  const file = new File([blob], fileName, { type: blob.type })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 200)
}

// ---- SVG 转 PNG ----

async function svgToBase64Png(svgEl) {
  const svgClone = svgEl.cloneNode(true)
  const bbox = svgEl.getBoundingClientRect()
  const width = Math.ceil(bbox.width) || 800
  const height = Math.ceil(bbox.height) || 400
  svgClone.setAttribute('width', width)
  svgClone.setAttribute('height', height)
  if (!svgClone.getAttribute('xmlns')) {
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  // 内联所有计算样式到 SVG 元素，确保文字可见
  inlineStyles(svgEl, svgClone)

  const svgData = new XMLSerializer().serializeToString(svgClone)
  // 将 SVG 字符串编码为 base64（支持 UTF-8 中文字符）
  const encoder = new TextEncoder()
  const bytes = encoder.encode(svgData)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64Svg = btoa(binary)
  const dataUri = `data:image/svg+xml;base64,${base64Svg}`

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = width * scale
      canvas.height = height * scale
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, width, height)
      resolve({ dataUrl: canvas.toDataURL('image/png'), width, height })
    }
    img.onerror = () => reject(new Error('SVG 转图片失败'))
    img.src = dataUri
  })
}

// 递归内联计算样式（确保 SVG 序列化后文字、颜色等不丢失）
function inlineStyles(source, target) {
  const computed = window.getComputedStyle(source)
  const dominated = ['font-family', 'font-size', 'font-weight', 'fill', 'stroke',
    'stroke-width', 'opacity', 'visibility', 'display', 'text-anchor',
    'dominant-baseline', 'color', 'transform']
  let style = ''
  for (const prop of dominated) {
    const val = computed.getPropertyValue(prop)
    if (val) style += `${prop}:${val};`
  }
  if (style) target.setAttribute('style', (target.getAttribute('style') || '') + ';' + style)

  const sourceChildren = source.children
  const targetChildren = target.children
  for (let i = 0; i < sourceChildren.length && i < targetChildren.length; i++) {
    inlineStyles(sourceChildren[i], targetChildren[i])
  }
}

// ---- DOM 解析为 docx 元素 ----

const HEADING_MAP = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
}

// 从 DOM 节点提取内联文本 runs（支持超链接、高亮、上下标、内联图片）
function extractTextRuns(node, inherited = {}) {
  const runs = []
  if (!node) return runs

  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent
      if (text) {
        runs.push(new TextRun({ text, ...inherited }))
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName
      // 跳过锚点图标
      if (child.classList?.contains('heading-anchor')) continue

      if (tag === 'STRONG' || tag === 'B') {
        runs.push(...extractTextRuns(child, { ...inherited, bold: true }))
      } else if (tag === 'EM' || tag === 'I') {
        runs.push(...extractTextRuns(child, { ...inherited, italics: true }))
      } else if (tag === 'CODE') {
        runs.push(new TextRun({
          text: child.textContent,
          font: 'Consolas',
          size: 18, // 9pt
          shading: { type: ShadingType.CLEAR, fill: 'f0f0f0' },
          ...inherited,
        }))
      } else if (tag === 'A') {
        const href = child.getAttribute('href') || ''
        // 生成真正的可点击超链接
        if (href && (href.startsWith('http') || href.startsWith('mailto:'))) {
          runs.push(new ExternalHyperlink({
            children: [new TextRun({
              text: child.textContent,
              style: 'Hyperlink',
              color: '4a6cf7',
              underline: {},
              ...inherited,
            })],
            link: href,
          }))
        } else {
          runs.push(new TextRun({
            text: child.textContent,
            color: '4a6cf7',
            underline: {},
            ...inherited,
          }))
        }
      } else if (tag === 'DEL' || tag === 'S') {
        runs.push(...extractTextRuns(child, { ...inherited, strike: true }))
      } else if (tag === 'MARK') {
        // 高亮文本
        runs.push(...extractTextRuns(child, {
          ...inherited,
          shading: { type: ShadingType.CLEAR, fill: 'ffff00' },
        }))
      } else if (tag === 'SUP') {
        runs.push(...extractTextRuns(child, { ...inherited, superScript: true }))
      } else if (tag === 'SUB') {
        runs.push(...extractTextRuns(child, { ...inherited, subScript: true }))
      } else if (tag === 'BR') {
        runs.push(new TextRun({ break: 1 }))
      } else if (tag === 'IMG') {
        // 内联图片标记为占位符（实际图片在段落级处理）
        const alt = child.getAttribute('alt') || '[图片]'
        runs.push(new TextRun({ text: alt, color: '999999', italics: true }))
      } else {
        runs.push(...extractTextRuns(child, inherited))
      }
    }
  }
  return runs
}

// 解析表格（兼容 Office + WPS）
function parseTable(tableEl) {
  // A4 内容区宽度（缇），左右页边距各 1.2 英寸，纸宽 8.27 英寸
  const TABLE_WIDTH_DXA = 9024
  const rows = []
  const allTr = tableEl.querySelectorAll('tr')

  // 1. 扫描最大列数（考虑 colspan）
  let maxCols = 0
  for (const tr of allTr) {
    let colCount = 0
    for (const td of tr.querySelectorAll('th, td')) {
      colCount += parseInt(td.getAttribute('colspan') || '1', 10)
    }
    maxCols = Math.max(maxCols, colCount)
  }
  if (maxCols === 0) return null

  // 2. 每列均分宽度
  const colWidth = Math.floor(TABLE_WIDTH_DXA / maxCols)

  // 3. 构建行（处理 colspan）
  for (const tr of allTr) {
    const cells = []
    const tds = tr.querySelectorAll('th, td')
    const isHeader = tr.querySelector('th') !== null
    for (const td of tds) {
      const colspan = parseInt(td.getAttribute('colspan') || '1', 10)
      const cellOpts = {
        children: [new Paragraph({
          children: extractTextRuns(td, isHeader ? { bold: true } : {}),
          spacing: { before: 40, after: 40 },
        })],
        shading: isHeader
          ? { type: ShadingType.CLEAR, fill: 'f0f0f0' }
          : undefined,
        width: { size: colWidth * colspan, type: WidthType.DXA },
      }
      if (colspan > 1) cellOpts.columnSpan = colspan
      cells.push(new TableCell(cellOpts))
    }
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }))
    }
  }
  if (rows.length === 0) return null

  // 4. FIXED 布局 + columnWidths（tblGrid），WPS 严格依赖这两项
  return new Table({
    rows,
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: Array(maxCols).fill(colWidth),
  })
}

// 解析列表
function parseList(listEl, level = 0) {
  const items = []
  for (const li of listEl.children) {
    if (li.tagName !== 'LI') continue
    // 检查 checkbox（任务列表）
    const checkbox = li.querySelector('input[type="checkbox"]')
    let prefix = ''
    if (checkbox) {
      prefix = checkbox.checked ? '[x] ' : '[ ] '
    }
    const isOrdered = listEl.tagName === 'OL'
    const idx = Array.from(listEl.children).indexOf(li)

    // 提取文本（排除嵌套列表，支持 li 内 p 包裹的多段落）
    const textRuns = []
    if (prefix) {
      textRuns.push(new TextRun({ text: prefix, font: 'Consolas', size: 20 }))
    }
    for (const child of li.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim()
        if (t) textRuns.push(new TextRun({ text: t }))
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const cTag = child.tagName
        if (cTag === 'UL' || cTag === 'OL') continue // 嵌套列表单独处理
        if (cTag === 'INPUT') continue // 跳过 checkbox 本身
        // li 内的 p 标签：提取内容并在段落间加换行
        if (cTag === 'P') {
          if (textRuns.length > 0) {
            textRuns.push(new TextRun({ break: 1 }))
          }
          textRuns.push(...extractTextRuns(child))
        } else {
          textRuns.push(...extractTextRuns(child))
        }
      }
    }

    const bullet = isOrdered ? `${idx + 1}. ` : '\u2022 '
    const baseIndent = 360
    const indent = baseIndent + level * 360
    items.push(new Paragraph({
      children: [
        new TextRun({ text: bullet }),
        ...textRuns,
      ],
      spacing: { before: 40, after: 40 },
      indent: { left: indent, hanging: 240 },
    }))

    // 嵌套列表
    const nested = li.querySelector('ul, ol')
    if (nested) {
      items.push(...parseList(nested, level + 1))
    }
  }
  return items
}

// 主解析函数：将 DOM 转为 docx 元素数组
async function parseDomToDocx(contentEl) {
  const elements = []

  for (const node of contentEl.children) {
    const tag = node.tagName

    // 标题
    if (HEADING_MAP[tag]) {
      const runs = extractTextRuns(node)
      elements.push(new Paragraph({
        children: runs,
        heading: HEADING_MAP[tag],
        spacing: { before: 240, after: 120 },
      }))
      continue
    }

    // 段落（处理内嵌图片）
    if (tag === 'P') {
      // 检查段落内是否有图片
      const imgs = node.querySelectorAll('img')
      if (imgs.length > 0) {
        // 先输出文本部分
        const runs = extractTextRuns(node)
        const textOnly = runs.filter(r => !(r instanceof ImageRun))
        if (textOnly.length > 0) {
          elements.push(new Paragraph({
            children: textOnly,
            spacing: { before: 80, after: 80 },
          }))
        }
        // 再逐个输出图片
        for (const img of imgs) {
          try {
            const imgData = await fetchImageAsBytes(img.src)
            if (imgData) {
              elements.push(new Paragraph({
                children: [new ImageRun({
                  data: imgData.bytes,
                  transformation: { width: imgData.width, height: imgData.height },
                  type: 'png',
                })],
                spacing: { before: 120, after: 120 },
                alignment: AlignmentType.CENTER,
              }))
            }
          } catch { /* 跳过无法加载的图片 */ }
        }
      } else {
        const runs = extractTextRuns(node)
        if (runs.length > 0) {
          elements.push(new Paragraph({
            children: runs,
            spacing: { before: 80, after: 80 },
          }))
        }
      }
      continue
    }

    // 文档元信息
    if (node.classList?.contains('doc-meta')) {
      elements.push(new Paragraph({
        children: [new TextRun({
          text: node.textContent.trim(),
          color: '999999',
          size: 18,
        })],
        spacing: { before: 40, after: 120 },
      }))
      continue
    }

    // 代码块
    if (node.classList?.contains('code-block-wrapper')) {
      const rawCode = decodeURIComponent(node.dataset.rawCode || '')
      const lang = (node.dataset.lang || '').toUpperCase()

      const codeLines = rawCode.split('\n')
      const codeRuns = []

      // 语言标签
      if (lang) {
        codeRuns.push(new TextRun({
          text: lang,
          font: 'Consolas',
          size: 16,
          color: '999999',
        }))
        codeRuns.push(new TextRun({ break: 1 }))
      }

      // 代码内容，逐行添加
      codeLines.forEach((line, i) => {
        codeRuns.push(new TextRun({
          text: line || ' ', // 空行用空格占位
          font: 'Consolas',
          size: 18,
          color: '333333',
        }))
        if (i < codeLines.length - 1) {
          codeRuns.push(new TextRun({ break: 1 }))
        }
      })

      elements.push(new Paragraph({
        children: codeRuns,
        alignment: AlignmentType.LEFT,
        shading: { type: ShadingType.CLEAR, fill: 'f5f5f5' },
        spacing: { before: 120, after: 120, line: 276 },
        border: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'dddddd' },
        },
        indent: { left: 200, right: 200 },
      }))
      continue
    }

    // Mermaid 图表
    if (node.classList?.contains('mermaid')) {
      const svg = node.querySelector('svg')
      if (svg) {
        try {
          const { dataUrl, width, height } = await svgToBase64Png(svg)
          // base64 数据提取
          const base64Data = dataUrl.split(',')[1]
          const binaryString = atob(base64Data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          // 限制最大宽度为 6 英寸（Word 页面宽度约 6.5 英寸）
          const maxWidth = 6 * 96 // 576px
          const scale = width > maxWidth ? maxWidth / width : 1
          const imgWidth = Math.round(width * scale)
          const imgHeight = Math.round(height * scale)

          elements.push(new Paragraph({
            children: [new ImageRun({
              data: bytes,
              transformation: { width: imgWidth, height: imgHeight },
              type: 'png',
            })],
            spacing: { before: 120, after: 120 },
            alignment: AlignmentType.CENTER,
          }))
        } catch {
          elements.push(new Paragraph({
            children: [new TextRun({ text: '[图表无法导出]', color: '999999', italics: true })],
          }))
        }
      }
      continue
    }

    // 表格（可能被 table-outer 或 table-wrapper 包裹）
    if (tag === 'TABLE' || node.classList?.contains('table-wrapper') || node.classList?.contains('table-outer')) {
      const tableEl = tag === 'TABLE' ? node : node.querySelector('table')
      if (tableEl) {
        const table = parseTable(tableEl)
        if (table) elements.push(table)
      }
      continue
    }

    // 列表
    if (tag === 'UL' || tag === 'OL') {
      elements.push(...parseList(node))
      continue
    }

    // 引用块：递归处理内部块级元素，保留完整结构
    if (tag === 'BLOCKQUOTE') {
      const bqStyle = {
        indent: { left: 400 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 6, color: 'cccccc' },
        },
        shading: { type: ShadingType.CLEAR, fill: 'fafafa' },
      }
      if (node.children.length > 0) {
        for (const child of node.children) {
          const childTag = child.tagName
          // 嵌套引用块：增加缩进
          if (childTag === 'BLOCKQUOTE') {
            const innerChildren = child.children.length > 0 ? child.children : [child]
            for (const inner of innerChildren) {
              const runs = extractTextRuns(inner)
              if (runs.length > 0) {
                elements.push(new Paragraph({
                  children: runs,
                  spacing: { before: 80, after: 80 },
                  indent: { left: 800 },
                  border: {
                    left: { style: BorderStyle.SINGLE, size: 6, color: 'aaaaaa' },
                  },
                  shading: { type: ShadingType.CLEAR, fill: 'f5f5f5' },
                }))
              }
            }
          } else if (childTag === 'UL' || childTag === 'OL') {
            // 引用块内的列表
            const listItems = parseList(child)
            for (const item of listItems) {
              elements.push(item)
            }
          } else if (childTag === 'PRE' || child.classList?.contains('code-block-wrapper')) {
            // 引用块内的代码块，走正常代码块逻辑但加引用样式
            const runs = extractTextRuns(child)
            if (runs.length > 0) {
              elements.push(new Paragraph({
                children: runs,
                spacing: { before: 80, after: 80 },
                ...bqStyle,
              }))
            }
          } else {
            const runs = extractTextRuns(child)
            if (runs.length > 0) {
              elements.push(new Paragraph({
                children: runs,
                spacing: { before: 80, after: 80 },
                ...bqStyle,
              }))
            }
          }
        }
      } else {
        const runs = extractTextRuns(node)
        if (runs.length > 0) {
          elements.push(new Paragraph({
            children: runs,
            spacing: { before: 80, after: 80 },
            ...bqStyle,
          }))
        }
      }
      continue
    }

    // 图片
    if (tag === 'IMG') {
      try {
        const imgData = await fetchImageAsBytes(node.src)
        if (imgData) {
          elements.push(new Paragraph({
            children: [new ImageRun({
              data: imgData.bytes,
              transformation: { width: imgData.width, height: imgData.height },
              type: 'png',
            })],
            spacing: { before: 120, after: 120 },
            alignment: AlignmentType.CENTER,
          }))
        }
      } catch { /* 跳过无法加载的图片 */ }
      continue
    }

    // 水平线
    if (tag === 'HR') {
      elements.push(new Paragraph({
        children: [],
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'cccccc' } },
        spacing: { before: 120, after: 120 },
      }))
      continue
    }

    // 其他 div 容器，递归处理子元素
    if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') {
      const sub = await parseDomToDocx(node)
      elements.push(...sub)
      continue
    }

    // 兜底：提取文本
    const text = node.textContent?.trim()
    if (text) {
      elements.push(new Paragraph({
        children: [new TextRun({ text })],
        spacing: { before: 80, after: 80 },
      }))
    }
  }

  return elements
}

// 加载图片为字节数组
async function fetchImageAsBytes(src) {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = src
    })
    const maxWidth = 576
    const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.split(',')[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { bytes, width: w, height: h }
  } catch {
    return null
  }
}

// ---- 主 composable ----

export function useExportWord() {
  const exporting = ref(false)

  async function exportToWord(title = '文档') {
    exporting.value = true
    try {
      const contentEl = document.querySelector('.markdown-content')
      if (!contentEl) return

      const children = await parseDomToDocx(contentEl)

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: 'Microsoft YaHei',
                size: 22, // 11pt
                color: '333333',
              },
              paragraph: {
                spacing: { line: 360 }, // 1.5 倍行距
                alignment: AlignmentType.LEFT,
              },
            },
            heading1: {
              run: { font: 'Microsoft YaHei', size: 36, bold: true, color: '333333' },
            },
            heading2: {
              run: { font: 'Microsoft YaHei', size: 32, bold: true, color: '333333' },
            },
            heading3: {
              run: { font: 'Microsoft YaHei', size: 28, bold: true, color: '333333' },
            },
            heading4: {
              run: { font: 'Microsoft YaHei', size: 26, bold: true, color: '333333' },
            },
            heading5: {
              run: { font: 'Microsoft YaHei', size: 24, bold: true, color: '333333' },
            },
            heading6: {
              run: { font: 'Microsoft YaHei', size: 22, bold: true, color: '333333' },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(1),
                bottom: convertInchesToTwip(1),
                left: convertInchesToTwip(1.2),
                right: convertInchesToTwip(1.2),
              },
            },
          },
          children,
        }],
      })

      const blob = await Packer.toBlob(doc)
      // 确保 blob 的 MIME type 正确
      const wordBlob = new Blob([blob], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      const fileName = title.replace(/[\\/:*?"<>|]/g, '_') + '.docx'
      downloadBlob(wordBlob, fileName)
    } catch (err) {
      console.error('导出 Word 失败:', err)
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportToWord }
}
