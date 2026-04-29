/**
 * 图片格式转换工具（共享模块）
 * 提供 imgToPngBlob / svgToPngBlob 方法
 * 供 useMarkdown.js 和 ImageZoom.vue 共用
 */

/**
 * 将图片 URL 转为 PNG blob（兼容同源和跨域）
 * 策略1：fetch 获取 → 策略2：crossOrigin Image → 策略3：无 crossOrigin 直接画
 */
export async function imgToPngBlob(src) {
  try {
    const resp = await fetch(src)
    const blob = await resp.blob()
    if (blob.type === 'image/png') return blob
    return blobToCanvasPng(blob)
  } catch {
    try {
      return await loadImageToBlob(src, true)
    } catch {
      return loadImageToBlob(src, false)
    }
  }
}

/**
 * 加载图片到 canvas 并转 PNG blob
 * @param {string} src - 图片地址
 * @param {boolean} useCors - 是否设置 crossOrigin
 */
function loadImageToBlob(src, useCors) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (useCors) image.crossOrigin = 'anonymous'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        canvas.getContext('2d').drawImage(image, 0, 0)
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/png')
      } catch (e) { reject(e) }
    }
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

/**
 * 将任意图片 blob 通过 canvas 转为 PNG blob
 */
function blobToCanvasPng(srcBlob, scale = 1) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(srcBlob)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth * scale
      canvas.height = image.naturalHeight * scale
      const ctx = canvas.getContext('2d')
      if (scale !== 1) ctx.scale(scale, scale)
      ctx.drawImage(image, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => resolve(b), 'image/png')
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
    image.src = url
  })
}

/**
 * SVG 转 PNG blob（处理 foreignObject 导致的 tainted canvas 问题）
 * @param {SVGElement} svgEl - SVG DOM 元素
 * @param {number} scale - 缩放倍数，默认 2
 */
export function svgToPngBlob(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true)
    // 从 viewBox 或属性中获取 SVG 实际尺寸
    const viewBox = clone.getAttribute('viewBox')
    let svgWidth, svgHeight
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/)
      svgWidth = parseFloat(parts[2])
      svgHeight = parseFloat(parts[3])
    }
    if (!svgWidth || !svgHeight) {
      svgWidth = parseFloat(clone.getAttribute('width')) || svgEl.getBoundingClientRect().width || 800
      svgHeight = parseFloat(clone.getAttribute('height')) || svgEl.getBoundingClientRect().height || 600
    }
    // 显式设置 width/height，确保 Image 加载时尺寸正确
    clone.setAttribute('width', svgWidth)
    clone.setAttribute('height', svgHeight)
    // 将 foreignObject 替换为 text 元素，避免 canvas 被污染
    clone.querySelectorAll('foreignObject').forEach(fo => {
      const text = fo.textContent.trim()
      const x = fo.getAttribute('x') || '0'
      const y = fo.getAttribute('y') || '0'
      const width = fo.getAttribute('width') || '100'
      const height = fo.getAttribute('height') || '20'
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      textEl.setAttribute('x', String(parseFloat(x) + parseFloat(width) / 2))
      textEl.setAttribute('y', String(parseFloat(y) + parseFloat(height) / 2 + 5))
      textEl.setAttribute('text-anchor', 'middle')
      textEl.setAttribute('font-size', '14')
      textEl.setAttribute('fill', '#455a64')
      textEl.textContent = text
      fo.parentNode.replaceChild(textEl, fo)
    })
    const svgData = new XMLSerializer().serializeToString(clone)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    const image = new Image()
    image.onload = () => {
      const w = svgWidth * scale
      const h = svgHeight * scale
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(image, 0, 0, svgWidth, svgHeight)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob null')), 'image/png')
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG加载失败')) }
    image.src = url
  })
}
