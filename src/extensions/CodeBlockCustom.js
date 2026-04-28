import { Node, mergeAttributes, VueNodeViewRenderer, textblockTypeInputRule } from '@tiptap/vue-3'
import CodeBlockNodeView from '../components/CodeBlockNodeView.vue'

/**
 * 自定义代码块扩展
 * 编辑模式下渲染带 header（语言标签 + 复制按钮）的代码块，与查看模式风格一致
 */
export const CodeBlockCustom = Node.create({
  name: 'codeBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,
  isolating: true,
  code: true,

  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (element) => {
          const code = element.querySelector('code')
          if (!code) return null
          // 从 class="language-xxx" 中提取语言
          const cls = [...code.classList].find(c => c.startsWith('language-'))
          return cls ? cls.replace('language-', '') : null
        },
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
          if (!code) return {}
          // 排除 mermaid，由 MermaidBlock 处理
          if (code.classList.contains('language-mermaid')) return false
          return {}
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const lang = node.attrs.language
    return [
      'pre',
      mergeAttributes(HTMLAttributes),
      ['code', { class: lang ? `language-${lang}` : null }, 0],
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(CodeBlockNodeView)
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
      // 在代码块内按 Enter 保持在代码块中
      'Enter': ({ editor }) => {
        if (!editor.isActive('codeBlock')) return false
        return editor.commands.newlineInCode()
      },
      // 在代码块末尾按 Mod-Enter 跳出代码块
      'Mod-Enter': ({ editor }) => {
        if (!editor.isActive('codeBlock')) return false
        return editor.commands.exitCode()
      },
      // Backspace 在空代码块时退出
      'Backspace': ({ editor }) => {
        const { $anchor } = editor.state.selection
        if (!editor.isActive('codeBlock')) return false
        if ($anchor.parent.textContent.length > 0) return false
        return editor.commands.clearNodes()
      },
    }
  },

  // 输入规则：``` 触发代码块
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z]*)?[\s\n]$/,
        type: this.type,
        getAttributes: (match) => ({
          language: match[1] || null,
        }),
      }),
    ]
  },

  // tiptap-markdown 序列化规则
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          const lang = node.attrs.language || ''
          state.write('```' + lang + '\n')
          state.text(node.textContent, false)
          state.ensureNewLine()
          state.write('```')
          state.closeBlock(node)
        },
        parse: {},
      },
    }
  },
})
