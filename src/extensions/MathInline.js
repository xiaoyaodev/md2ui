import { Node, mergeAttributes, VueNodeViewRenderer } from '@tiptap/vue-3'
import MathInlineNodeView from '../components/MathInlineNodeView.vue'

// HTML 属性转义
function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 行内数学公式扩展（$...$）
 * 编辑模式下渲染为 inline NodeView
 */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span.math-inline-node',
        getAttrs: (node) => {
          const latex = node.getAttribute('data-latex') || node.textContent.trim()
          return latex ? { latex } : false
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      class: 'math-inline-node',
      'data-latex': node.attrs.latex,
    }), node.attrs.latex]
  },

  addNodeView() {
    return VueNodeViewRenderer(MathInlineNodeView)
  },

  addInputRules() {
    return [
      {
        find: /(?<!\$)\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]
          if (!latex || !latex.trim()) return
          const node = state.schema.nodes.mathInline.create({ latex: latex.trim() })
          const tr = state.tr.replaceWith(range.from, range.to, node)
          tr.insertText(' ', range.from + 1)
          return tr
        },
      },
    ]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write('$' + (node.attrs.latex || '') + '$')
        },
        parse: {
          // 给 markdown-it 注册行内公式规则
          setup(md) {
            md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
              if (state.src[state.pos] !== '$') return false
              if (state.src[state.pos + 1] === '$') return false // 跳过 $$
              const start = state.pos + 1
              let end = start
              while (end < state.posMax) {
                if (state.src[end] === '$' && state.src[end - 1] !== '\\') break
                end++
              }
              if (end >= state.posMax) return false
              if (end === start) return false // 空公式
              if (silent) return true
              const latex = state.src.slice(start, end).trim()
              const token = state.push('math_inline', 'span', 0)
              token.content = latex
              state.pos = end + 1
              return true
            })
            md.renderer.rules.math_inline = (tokens, idx) => {
              const latex = tokens[idx].content
              return '<span class="math-inline-node" data-latex="' + escapeAttr(latex) + '">' + escapeAttr(latex) + '</span>'
            }
          },
        },
      },
    }
  },
})
