import { ref } from 'vue'

/**
 * PDF 导出 — 基于浏览器 window.print() 实现
 * 通过创建独立的打印窗口，只包含文档内容，生成干净的 PDF
 */
export function useExportPdf() {
  const exportingPdf = ref(false)

  async function exportToPdf(title = '文档') {
    exportingPdf.value = true
    try {
      const contentEl = document.querySelector('.markdown-content')
      if (!contentEl) return

      // 克隆内容，移除不需要打印的元素
      const clone = contentEl.cloneNode(true)
      clone.querySelectorAll('.code-block-actions').forEach(el => el.remove())
      clone.querySelectorAll('.image-copy-btn, .mermaid-copy-btn').forEach(el => el.remove())
      clone.querySelectorAll('.table-toolbar').forEach(el => el.remove())

      // 收集页面中的样式
      const styles = []
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            styles.push(rule.cssText)
          }
        } catch {
          // 跨域样式表忽略
        }
      }

      // 创建打印窗口
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        alert('请允许弹出窗口以导出 PDF')
        return
      }

      const safeTitle = title.replace(/[<>&"]/g, c =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))

      printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${safeTitle}</title>
  <style>
    ${styles.join('\n')}
    body {
      margin: 0;
      padding: 20px 40px;
      background: #fff;
      color: #1a1e1b;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
    }
    .markdown-content {
      max-width: 100%;
      padding: 0;
      margin: 0;
    }
    .code-block-wrapper { break-inside: avoid; border: 1px solid #ddd; }
    .code-block-header { background: #f5f5f5; }
    table { break-inside: avoid; }
    .mermaid { break-inside: avoid; }
    .heading-anchor { display: none !important; }
    @media print {
      a[href^="http"]::after {
        content: " (" attr(href) ")";
        font-size: 0.85em;
        color: #666;
        word-break: break-all;
      }
      a[data-doc-key]::after { content: none; }
    }
  </style>
</head>
<body>
  <article class="markdown-content">${clone.innerHTML}</article>
</body>
</html>`)
      printWindow.document.close()

      // 等待加载完成后触发打印
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
          printWindow.onafterprint = () => printWindow.close()
        }, 500)
      }
    } catch (err) {
      console.error('导出 PDF 失败:', err)
    } finally {
      exportingPdf.value = false
    }
  }

  return { exportingPdf, exportToPdf }
}
