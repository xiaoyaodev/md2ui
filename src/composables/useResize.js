import { ref } from 'vue'

export function useResize() {
  const sidebarWidth = ref(320)
  const tocWidth = ref(240)
  const isResizing = ref(false)
  const resizeType = ref('')

  // 开始拖拽
  function startResize(type, e) {
    isResizing.value = true
    resizeType.value = type
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    
    const handleMouseMove = (e) => {
      if (!isResizing.value) return
      
      if (resizeType.value === 'left') {
        const newWidth = e.clientX
        if (newWidth >= 200 && newWidth <= 400) {
          sidebarWidth.value = newWidth
        }
      } else if (resizeType.value === 'right') {
        const newWidth = window.innerWidth - e.clientX
        if (newWidth >= 200 && newWidth <= 400) {
          tocWidth.value = newWidth
        }
      }
    }
    
    const handleMouseUp = () => {
      isResizing.value = false
      resizeType.value = ''
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return {
    sidebarWidth,
    tocWidth,
    startResize
  }
}
