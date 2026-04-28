import { Node, mergeAttributes, VueNodeViewRenderer } from '@tiptap/vue-3'
import MathBlockNodeView from '../components/MathBlockNodeView.vue'

// HTML 属性转义
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 块级数学公式扩展（$$...$$）
 * 编辑模式下渲染为可交互的 NodeView
 */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div.math-block',
        getAttrs: (node) => {
          const latex = node.getAttribute('data-latex') || node.textContent.trim()
          return { latex }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      class: 'math-block',
      'data-latex': node.attrs.latex,
    })]
  },

  addNodeView() {
    return VueNodeViewRenderer(MathBlockNodeView)
  },

  addKeyboardShortcuts() {
    return {
      'Backspace': ({ editor }) => {
        if (!editor.isActive('mathBlock')) return false
        return editor.commands.deleteSelection()
      },
    }
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write('$$\n')
          state.text(node.attrs.latex || '', false)
          state.ensureNewLine()
          state.write('$$')
          state.closeBlock(node)
        },
        parse: {
          // 给 markdown-it 注册块级公式规则
          setup(md) {
            md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
              const startPos = state.bMarks[startLine] + state.tShift[startLine]
              const maxPos = state.eMarks[startLine]
              if (startPos + 2 > maxPos) return false
              const marker = state.src.slice(startPos, startPos + 2)
              if (marker !== '$$') return false
              if (silent) return true
              let nextLine = startLine + 1
              let found = false
              while (nextLine < endLine) {
                const nPos = state.bMarks[nextLine] + state.tShift[nextLine]
                const nMax = state.eMarks[nextLine]
                if (nPos < nMax && state.src.slice(nPos, nPos + 2) === '$$') {
                  found = true
                  break
                }
                nextLine++
              }
              if (!found) return false
              // 提取 $$ 之间的内容
              const contentStart = state.bMarks[startLine + 1]
              const contentEnd = state.eMarks[nextLine - 1]
              const latex = state.src.slice(contentStart, contentEnd).trim()
              const token = state.push('math_block', 'div', 0)
              token.content = latex
              token.map = [startLine, nextLine + 1]
              state.line = nextLine + 1
              return true
            })
            md.renderer.rules.math_block = (tokens, idx) => {
              const latex = tokens[idx].content
              return '<div class="math-block" data-latex="' + escapeAttr(latex) + '"></div>'
            }
          },
        },
      },
    }
  },
})
