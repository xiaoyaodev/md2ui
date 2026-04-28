import { ref, onMounted, onBeforeUnmount } from 'vue'
import { pollDocsList, pollDocContent } from '../services/DocService.js'

/**
 * 轮询监听文件变更
 * 通过 DocService 统一处理模式检测和 ETag，这里只管定时调用
 */
export function useFileWatcher({ getCurrentDocPath, onDocsListChange, onDocContentChange }) {
  const watching = ref(false)
  let timer = null
  let polling = false

  async function poll() {
    if (polling) return
    polling = true
    try {
      // 轮询文档列表
      const newTree = await pollDocsList()
      if (newTree) onDocsListChange?.(newTree)

      // 轮询当前文档内容
      const docPath = getCurrentDocPath?.()
      const content = await pollDocContent(docPath)
      if (content !== null) onDocContentChange?.(content)
    } finally {
      polling = false
    }
  }

  function start() {
    if (watching.value) return
    watching.value = true
    timer = setInterval(poll, 500)
  }

  function stop() {
    watching.value = false
    if (timer) { clearInterval(timer); timer = null }
  }

  onMounted(start)
  onBeforeUnmount(stop)

  return { watching, start, stop }
}
