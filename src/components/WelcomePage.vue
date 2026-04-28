<template>
  <div class="welcome-page">
    <div class="welcome-hero">
      <!-- 图标 + 标题同行 -->
      <div class="welcome-brand">
        <div class="welcome-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="4" width="20" height="24" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
            <line x1="10" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="10" y1="16" x2="22" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="10" y1="22" x2="17" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 class="welcome-title">md2ui</h1>
      </div>
      <p class="welcome-desc">将 Markdown 文档转换为美观易读的网页</p>
      <!-- 操作区 -->
      <div class="welcome-actions">
        <button class="welcome-btn primary" @click="$emit('start')">
          <BookOpen :size="16" />
          <span>开始阅读</span>
          <ArrowRight :size="14" class="btn-arrow" />
        </button>
      </div>
      <!-- GitHub -->
      <a class="welcome-github" href="https://github.com/xiaoyaodev/md2ui" target="_blank">
        <GitHubIcon :size="16" />
        <span>GitHub</span>
        <span class="welcome-github-sep"></span>
        <span class="welcome-github-repo">xiaoyaodev/md2ui</span>
        <ExternalLink :size="12" class="welcome-github-arrow" />
      </a>
    </div>
    <!-- 特性卡片 -->
    <div class="welcome-features">
      <div class="feature-card" v-for="f in features" :key="f.title">
        <div class="feature-icon-wrap">
          <component :is="f.icon" :size="20" />
        </div>
        <h3>{{ f.title }}</h3>
        <p>{{ f.desc }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { BookOpen, Github as GitHubIcon, ArrowRight, ExternalLink, FileText, Palette, Zap } from 'lucide-vue-next'

defineEmits(['start'])

const features = [
  { icon: FileText, title: 'Markdown 驱动', desc: '直接读取 .md 文件，零配置即可使用' },
  { icon: Palette, title: '简洁优雅', desc: '清晰的排版与舒适的阅读体验' },
  { icon: Zap, title: '开箱即用', desc: '一行命令启动，支持目录结构与 Mermaid 图表' }
]
</script>

<style scoped>
.welcome-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 48px 24px;
  user-select: none;
}

.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 40px;
}

.welcome-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.welcome-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-radius: 10px;
}

.welcome-title {
  font-size: 32px;
  font-weight: 600;
  color: var(--color-text);
  letter-spacing: -0.03em;
  border: none;
  padding: 0;
  margin: 0;
}

.welcome-desc {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.welcome-actions {
  margin-top: 4px;
}

.welcome-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  text-decoration: none;
  border: none;
  font-family: inherit;
}

.welcome-btn.primary {
  background: var(--color-accent);
  color: #fff;
}

.welcome-btn.primary:hover {
  background: var(--color-accent-hover);
}

.btn-arrow {
  opacity: 0.7;
  transition: all 0.15s;
}

.welcome-btn.primary:hover .btn-arrow {
  opacity: 1;
  transform: translateX(2px);
}

.welcome-github {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  text-decoration: none;
  transition: all 0.15s;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.welcome-github:hover {
  background: var(--color-bg-tertiary);
}

.welcome-github-sep {
  width: 1px;
  height: 12px;
  background: var(--color-border);
}

.welcome-github-repo {
  color: var(--color-text-secondary);
  font-weight: 400;
  font-size: 12px;
}

.welcome-github-arrow {
  color: var(--color-text-tertiary);
}

.welcome-features {
  display: flex;
  gap: 16px;
  max-width: 640px;
  width: 100%;
}

.feature-card {
  flex: 1;
  text-align: center;
  padding: 20px 14px 16px;
  border-radius: 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  transition: all 0.15s;
}

.feature-card:hover {
  border-color: var(--color-text-tertiary);
}

.feature-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-accent-bg);
  color: var(--color-accent);
  border-radius: 8px;
  margin-bottom: 10px;
}

.feature-card h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.feature-card p {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

@media (max-width: 640px) {
  .welcome-page {
    padding: 32px 16px;
  }
  .welcome-features {
    flex-direction: column;
    gap: 8px;
  }
  .welcome-title {
    font-size: 24px;
  }
  .welcome-logo {
    width: 36px;
    height: 36px;
  }
  .welcome-logo svg {
    width: 22px;
    height: 22px;
  }
}
</style>
