<template>
  <teleport to="body">
    <div
      v-if="visible"
      class="image-zoom-overlay"
      @click="handleOverlayClick"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    >
      <div class="image-zoom-container">
        <!-- 工具栏 -->
        <div class="zoom-toolbar">
          <button class="zoom-btn" @click="handleZoomIn" title="放大">
            <ZoomIn :size="16" />
          </button>
          <button class="zoom-btn" @click="handleZoomOut" title="缩小">
            <ZoomOut :size="16" />
          </button>
          <button class="zoom-btn" @click="resetZoom" title="重置">
            <RotateCcw :size="16" />
          </button>
          <button class="zoom-btn" :class="{ 'copy-success': copySuccess, 'copy-fail': copyFail }" @click="handleCopyImage" :title="copySuccess ? '已复制' : '复制图片'">
            <Check v-if="copySuccess" :size="16" />
            <Copy v-else :size="16" />
          </button>
          <transition name="tip-fade">
            <span v-if="copySuccess" class="copy-tip copy-tip-ok">已复制</span>
            <span v-else-if="copyFail" class="copy-tip copy-tip-fail">复制失败</span>
          </transition>
          <span class="zoom-level">{{ Math.round(scale * 100) }}%</span>
          <!-- 图片计数 -->
          <span v-if="images.length > 1" class="image-counter">{{ currentIndex + 1 }} / {{ images.length }}</span>
          <button class="zoom-btn close-btn" @click="close" title="关闭">
            <X :size="16" />
          </button>
        </div>

        <!-- 左切换按钮 -->
        <button
          v-if="images.length > 1"
          class="nav-btn nav-btn-left"
          :class="{ 'nav-btn-disabled': currentIndex <= 0 }"
          :disabled="currentIndex <= 0"
          @click="goPrev"
          title="上一张"
        >
          <ChevronLeft :size="28" />
        </button>

        <!-- 图片容器 -->
        <div
          class="image-wrapper"
          :style="{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: 'center center'
          }"
          v-html="currentContent"
        ></div>

        <!-- 右切换按钮 -->
        <button
          v-if="images.length > 1"
          class="nav-btn nav-btn-right"
          :class="{ 'nav-btn-disabled': currentIndex >= images.length - 1 }"
          :disabled="currentIndex >= images.length - 1"
          @click="goNext"
          title="下一张"
        >
          <ChevronRight :size="28" />
        </button>
      </div>
    </div>
  </teleport>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { ZoomIn, ZoomOut, RotateCcw, X, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-vue-next'

// Props
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  // 兼容单图模式
  imageContent: {
    type: String,
    default: ''
  },
  // 图片列表（多图切换）
  images: {
    type: Array,
    default: () => []
  },
  // 当前图片索引
  currentIndex: {
    type: Number,
    default: 0
  }
})

// Emits
const emit = defineEmits(['close', 'update:currentIndex'])

// 当前展示内容：优先使用列表模式
const currentContent = computed(() => {
  if (props.images.length > 0) {
    return props.images[props.currentIndex] || ''
  }
  return props.imageContent
})

// 缩放和拖拽状态
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)
const copySuccess = ref(false)
const copyFail = ref(false)

// 缩放控制
const minScale = 0.1
const maxScale = 10
const scaleStep = 0.2

// 放大
function handleZoomIn() {
  if (scale.value < maxScale) {
    scale.value = Math.min(scale.value + scaleStep, maxScale)
  }
}

// 缩小
function handleZoomOut() {
  if (scale.value > minScale) {
    scale.value = Math.max(scale.value - scaleStep, minScale)
  }
}

// 重置缩放
function resetZoom() {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

// 切换图片时重置缩放
function goPrev() {
  if (props.currentIndex > 0) {
    resetZoom()
    emit('update:currentIndex', props.currentIndex - 1)
  }
}

function goNext() {
  if (props.currentIndex < props.images.length - 1) {
    resetZoom()
    emit('update:currentIndex', props.currentIndex + 1)
  }
}

// 关闭
function close() {
  resetZoom()
  emit('close')
}

// 复制图片到剪贴板
async function handleCopyImage() {
  try {
    const wrapper = document.querySelector('.image-wrapper')
    if (!wrapper) return
    const img = wrapper.querySelector('img')
    const svg = wrapper.querySelector('svg')

    let blobPromise
    if (img) {
      // 构造 PNG blob Promise
      blobPromise = imgToPngBlob(img.src)
    } else if (svg) {
      blobPromise = svgToPngBlob(svg, 2)
    } else {
      return
    }

    const item = new ClipboardItem({ 'image/png': blobPromise })
    await navigator.clipboard.write([item])
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 1500)
  } catch (e) {
    console.warn('复制图片失败:', e)
    copyFail.value = true
    setTimeout(() => { copyFail.value = false }, 1500)
  }
}

// 将图片 URL 转为 PNG blob（兼容同源和跨域）
async function imgToPngBlob(src) {
  // 策略1：fetch 获取（同源图片直接成功）
  try {
    const resp = await fetch(src)
    const blob = await resp.blob()
    if (blob.type === 'image/png') return blob
    return blobToCanvasPng(blob, 1)
  } catch {
    // 策略2：通过 crossOrigin Image 加载（需服务器支持 CORS）
    try {
      return await loadImageToBlob(src, true)
    } catch {
      // 策略3：不设 crossOrigin 直接画（可能被 taint，但对某些场景有效）
      return loadImageToBlob(src, false)
    }
  }
}

// 加载图片到 canvas 并转 PNG blob
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
      } catch (e) {
        reject(e)
      }
    }
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

// 将任意图片 blob 通过 canvas 转为 PNG blob
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

// SVG 转 PNG blob（处理 foreignObject 导致的 tainted canvas 问题）
function svgToPngBlob(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true)
    // 从 viewBox 或属性中获取 SVG 实际尺寸，确保复制完整
    const viewBox = clone.getAttribute('viewBox')
    let svgWidth, svgHeight
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/)
      svgWidth = parseFloat(parts[2])
      svgHeight = parseFloat(parts[3])
    }
    // 回退到 width/height 属性或 getBoundingClientRect
    if (!svgWidth || !svgHeight) {
      svgWidth = parseFloat(clone.getAttribute('width')) || svgEl.getBoundingClientRect().width || 800
      svgHeight = parseFloat(clone.getAttribute('height')) || svgEl.getBoundingClientRect().height || 600
    }
    // 显式设置 width/height 属性，确保 Image 加载时尺寸正确
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
      // 使用从 SVG 提取的精确尺寸，而非 naturalWidth/Height（后者对无 width/height 的 SVG 不可靠）
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

// 处理遮罩层点击
function handleOverlayClick(event) {
  if (event.target.classList.contains('image-zoom-overlay')) {
    close()
  }
}

// 处理滚轮缩放
function handleWheel(event) {
  event.preventDefault()
  const zoomFactor = 0.02
  const direction = event.deltaY > 0 ? -1 : 1
  const newScale = Math.max(minScale, Math.min(maxScale, scale.value * (1 + direction * zoomFactor)))
  if (newScale !== scale.value) {
    scale.value = newScale
  }
}

// 处理鼠标按下
function handleMouseDown(event) {
  if (event.target.closest('.zoom-toolbar') || event.target.closest('.nav-btn')) return
  isDragging.value = true
  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY
  event.preventDefault()
}

// 处理鼠标移动
function handleMouseMove(event) {
  if (!isDragging.value) return
  const deltaX = event.clientX - lastMouseX.value
  const deltaY = event.clientY - lastMouseY.value
  translateX.value += deltaX
  translateY.value += deltaY
  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY
}

// 处理鼠标释放
function handleMouseUp() {
  isDragging.value = false
}

// 监听键盘事件
function handleKeyDown(event) {
  if (!props.visible) return
  switch (event.key) {
    case 'Escape':
      close()
      break
    case '+':
    case '=':
      handleZoomIn()
      break
    case '-':
      handleZoomOut()
      break
    case '0':
      resetZoom()
      break
    case 'ArrowLeft':
      goPrev()
      break
    case 'ArrowRight':
      goNext()
      break
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleKeyDown)
}
</script>

<style scoped>
.image-zoom-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
}

.image-zoom-overlay:active {
  cursor: grabbing;
}

.image-zoom-container {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  overflow: auto;
  padding: 40px;
}

.zoom-toolbar {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  pointer-events: auto;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: #4a5568;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}

.zoom-btn:hover {
  background: #f7fafc;
  color: #2d3748;
}

.close-btn {
  color: #e53e3e;
}

.close-btn:hover {
  background: #fed7d7;
  color: #c53030;
}

.copy-success {
  color: #38a169 !important;
}

.copy-fail {
  color: #e53e3e !important;
}

.copy-tip {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.copy-tip-ok {
  color: #38a169;
}

.copy-tip-fail {
  color: #e53e3e;
}

.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.2s;
}

.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}

.zoom-level {
  font-size: 12px;
  font-weight: 600;
  color: #4a5568;
  padding: 0 8px;
  min-width: 50px;
  text-align: center;
}

.image-counter {
  font-size: 12px;
  font-weight: 600;
  color: #718096;
  padding: 0 4px;
  white-space: nowrap;
}

/* 左右切换按钮 */
.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10000;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #2d3748;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
}

.nav-btn:hover:not(:disabled) {
  background: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.nav-btn-disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-btn-left {
  left: 20px;
}

.nav-btn-right {
  right: 20px;
}

.image-wrapper {
  transition: transform 0.2s ease-out;
  cursor: grab;
  background: rgba(255, 255, 255, 0.98);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  pointer-events: auto;
}

.image-wrapper:active {
  cursor: grabbing;
}

/* 确保图片在放大浮层中有合理的最小尺寸，避免复制按钮遮挡 */
.image-wrapper :deep(img) {
  display: block;
  min-width: 200px;
  min-height: 200px;
  object-fit: contain;
}

/* 确保SVG在放大时保持清晰 */
.image-wrapper :deep(svg) {
  display: block !important;
  background: white;
  border-radius: 4px;
  min-width: 800px;
  width: auto !important;
  height: auto !important;
}
</style>
