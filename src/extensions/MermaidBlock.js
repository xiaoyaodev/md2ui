import { Node, mergeAttributes, VueNodeViewRenderer } from '@tiptap/vue-3'
import MermaidNodeView from '../components/MermaidNodeView.vue'

/**
 * Tiptap Mermaid 扩展
 * 编辑模式下将 mermaid 代码块渲染为图表预览，右上角提供编辑按钮
 */
export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,
  isolating: true,
  code: true,

  addAttributes() {
    return {
      language: {
        default: 'mermaid',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (node) => {
          const code = node.querySelector('code')
          if (!code) return false
          const isMermaid = code.classList.contains('language-mermaid')
          return isMermaid ? {} : false
        },
        // 优先级高于默认 codeBlock
        priority: 60,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(HTMLAttributes),
      ['code', { class: 'language-mermaid' }, 0],
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(MermaidNodeView)
  },

  // tiptap-markdown 序列化/解析规则
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write('```mermaid\n')
          state.text(node.textContent, false)
          state.ensureNewLine()
          state.write('```')
          state.closeBlock(node)
        },
        parse: {
          // 不需要额外的 parse 配置，
          // Markdown 解析后会生成 <pre><code class="language-mermaid"> 结构，
          // 由 parseHTML 规则匹配
        },
      },
    }
  },
})
