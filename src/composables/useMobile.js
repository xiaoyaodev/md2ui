import { ref } from 'vue'

const MOBILE_BREAKPOINT = 768

// 单例状态，确保多处调用共享同一份
const isMobile = ref(false)
const mobileDrawerOpen = ref(false)
const mobileTocOpen = ref(false)
let listenerAttached = false

// 移动端检测 & 抽屉/TOC 面板状态
export function useMobile() {
  function checkMobile() {
    isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
    if (!isMobile.value) {
      mobileDrawerOpen.value = false
      mobileTocOpen.value = false
    }
  }

  // 只绑定一次事件监听
  if (!listenerAttached && typeof window !== 'undefined') {
    checkMobile()
    window.addEventListener('resize', checkMobile)
    listenerAttached = true
  }

  return { isMobile, mobileDrawerOpen, mobileTocOpen }
}
