// Mermaid SVG 渲染缓存，以源码为 key，SVG 字符串为 value
const _cache = new Map()

export function getMermaidCache(code) {
  return _cache.get(code.trim()) || null
}

export function setMermaidCache(code, svg) {
  _cache.set(code.trim(), svg)
}

// 切换文档时清空缓存，避免内存泄漏
export function clearMermaidCache() {
  _cache.clear()
}
