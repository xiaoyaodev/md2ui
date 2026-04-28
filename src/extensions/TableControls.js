/**
 * 表格控件扩展 - Excel 风格行号列头
 * 左侧显示行号（1, 2, 3...），顶部显示列头（A, B, C...），左上角全选按钮
 * 行号/列头常驻显示，点击可选中整行/整列
 * hover 删除按钮时高亮整行/整列（使用 overlay div，因为 ProseMirror 会阻止 td 的 background-color）
 */
import { Extension } from '@tiptap/vue-3'
import { CellSelection } from '@tiptap/pm/tables'

const ICON_PLUS = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="2" x2="6" y2="10"/><line x1="2" y1="6" x2="10" y2="6"/></svg>`
const ICON_TRASH = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h8M4.5 3V2h3v1M3 3l.5 7h5l.5-7"/></svg>`

const EDGE_THRESHOLD = 14
const GUTTER = 28

function findClosestTable(dom) {
  let el = dom
  while (el && el !== document.body) {
    if (el.tagName === 'TABLE') return el
    if (el.classList && el.classList.contains('tableWrapper')) return el.querySelector('table')
    el = el.parentElement
  }
  return null
}

function focusCellAt(view, editor, table, rowIdx, colIdx) {
  const rows = table.querySelectorAll('tr')
  if (!rows[rowIdx]) return
  const cells = rows[rowIdx].children
  if (!cells[colIdx]) return
  const pos = view.posAtDOM(cells[colIdx], 0)
  if (pos != null) editor.commands.setTextSelection(pos)
}

function createBtn(cls, icon, title) {
  const b = document.createElement('button')
  b.className = cls
  b.innerHTML = icon
  b.title = title
  return b
}

/**
 * 通过 CellSelection 全选一行
 */
function selectRow(view, editor, table, rowIdx) {
  const rows = table.querySelectorAll('tr')
  if (!rows[rowIdx]) return
  const cells = rows[rowIdx].children
  if (!cells.length) return
  // posAtDOM 返回单元格内部的位置，resolve 后用 before() 找到单元格节点的起始位置
  const firstPos = view.posAtDOM(cells[0], 0)
  const lastPos = view.posAtDOM(cells[cells.length - 1], 0)
  if (firstPos == null || lastPos == null) return
  try {
    const $first = view.state.doc.resolve(firstPos)
    const $last = view.state.doc.resolve(lastPos)
    // 向上找到 depth 对应 tableCell/tableHeader 的层级
    const firstCellPos = findCellPos($first)
    const lastCellPos = findCellPos($last)
    if (firstCellPos == null || lastCellPos == null) return
    const sel = CellSelection.create(view.state.doc, firstCellPos, lastCellPos)
    view.dispatch(view.state.tr.setSelection(sel))
  } catch (e) {
    console.warn('selectRow failed:', e)
  }
}

/**
 * 通过 CellSelection 全选一列
 */
function selectCol(view, editor, table, colIdx) {
  const rows = table.querySelectorAll('tr')
  if (!rows.length) return
  const firstCell = rows[0].children[colIdx]
  const lastCell = rows[rows.length - 1].children[colIdx]
  if (!firstCell || !lastCell) return
  const firstPos = view.posAtDOM(firstCell, 0)
  const lastPos = view.posAtDOM(lastCell, 0)
  if (firstPos == null || lastPos == null) return
  try {
    const $first = view.state.doc.resolve(firstPos)
    const $last = view.state.doc.resolve(lastPos)
    const firstCellPos = findCellPos($first)
    const lastCellPos = findCellPos($last)
    if (firstCellPos == null || lastCellPos == null) return
    const sel = CellSelection.create(view.state.doc, firstCellPos, lastCellPos)
    view.dispatch(view.state.tr.setSelection(sel))
  } catch (e) {
    console.warn('selectCol failed:', e)
  }
}

/**
 * 从 resolved position 向上查找 tableCell 或 tableHeader 节点的起始位置
 */
function findCellPos($pos) {
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      return $pos.before(d)
    }
  }
  return null
}

// ===== 高亮 overlay =====
let _highlightOverlay = null

function clearHighlights() {
  if (_highlightOverlay && _highlightOverlay.parentElement) {
    _highlightOverlay.parentElement.removeChild(_highlightOverlay)
  }
  _highlightOverlay = null
}

/**
 * 创建高亮 overlay，覆盖指定的行/列/整个表格
 * @param {'row'|'col'|'table'} type
 * @param {HTMLTableElement} table
 * @param {number} index - 行号或列号（type='table' 时忽略）
 */
function showHighlightOverlay(type, table, index) {
  clearHighlights()
  const wrapper = table.closest('.tableWrapper') || table.parentElement
  if (!wrapper) return
  const wrapperRect = wrapper.getBoundingClientRect()
  const tableRect = table.getBoundingClientRect()
  const rows = Array.from(table.querySelectorAll('tr'))
  if (!rows.length) return

  const overlay = document.createElement('div')
  overlay.className = 'tc-highlight-overlay'

  if (type === 'table') {
    overlay.style.cssText = `
      position:absolute; pointer-events:none; z-index:10;
      left:${tableRect.left - wrapperRect.left}px;
      top:${tableRect.top - wrapperRect.top}px;
      width:${tableRect.width}px;
      height:${tableRect.height}px;
    `
  } else if (type === 'row' && rows[index]) {
    const rr = rows[index].getBoundingClientRect()
    overlay.style.cssText = `
      position:absolute; pointer-events:none; z-index:10;
      left:${tableRect.left - wrapperRect.left}px;
      top:${rr.top - wrapperRect.top}px;
      width:${tableRect.width}px;
      height:${rr.height}px;
    `
  } else if (type === 'col') {
    const firstRowCells = Array.from(rows[0].children)
    if (!firstRowCells[index]) return
    const cr = firstRowCells[index].getBoundingClientRect()
    overlay.style.cssText = `
      position:absolute; pointer-events:none; z-index:10;
      left:${cr.left - wrapperRect.left}px;
      top:${tableRect.top - wrapperRect.top}px;
      width:${cr.width}px;
      height:${tableRect.height}px;
    `
  } else {
    return
  }

  wrapper.appendChild(overlay)
  _highlightOverlay = overlay
}

// 标记：通过行号/列头/全选角标触发的选中，不弹浮动菜单
let _headerSelectFlag = false

/**
 * 列索引转 Excel 风格字母（0->A, 1->B, ..., 25->Z, 26->AA）
 */
function colToLetter(idx) {
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/**
 * 渲染 Excel 风格的行号列头（常驻）+ hover 时的删除/插入按钮
 */
function renderHoverControls(view, table, container, editor, mouseX, mouseY) {
  clearHighlights()
  container.innerHTML = ''

  const rows = Array.from(table.querySelectorAll('tr'))
  if (!rows.length) return
  const firstRowCells = Array.from(rows[0].children)
  const tableRect = table.getBoundingClientRect()
  const wrapper = container.parentElement
  const wrapperRect = wrapper.getBoundingClientRect()

  container.style.cssText = `
    position:absolute; left:0; top:0; right:0; bottom:0;
    pointer-events:none; z-index:15;
  `

  const tLeft = tableRect.left - wrapperRect.left
  const tTop = tableRect.top - wrapperRect.top

  function isMouseOverBtn(btn) {
    const r = btn.getBoundingClientRect()
    return mouseX >= r.left - 2 && mouseX <= r.right + 2 && mouseY >= r.top - 2 && mouseY <= r.bottom + 2
  }

  // --- 1. 左上角全选角标 ---
  const cornerBtn = document.createElement('div')
  cornerBtn.className = 'tc-corner-btn'
  cornerBtn.title = '选择整个表格'
  cornerBtn.style.cssText = `
    left:${tLeft - GUTTER}px;
    top:${tTop - GUTTER}px;
    width:${GUTTER - 1}px;
    height:${GUTTER - 1}px;
  `
  // 左上角小三角
  const triangle = document.createElement('div')
  triangle.className = 'tc-corner-triangle'
  cornerBtn.appendChild(triangle)
  cornerBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation()
    _headerSelectFlag = true
    // 全选表格：选中从第一个到最后一个单元格
    const firstCell = rows[0].children[0]
    const lastRow = rows[rows.length - 1]
    const lastCell = lastRow.children[lastRow.children.length - 1]
    if (firstCell && lastCell) {
      const firstPos = view.posAtDOM(firstCell, 0)
      const lastPos = view.posAtDOM(lastCell, 0)
      if (firstPos != null && lastPos != null) {
        try {
          const $first = view.state.doc.resolve(firstPos)
          const $last = view.state.doc.resolve(lastPos)
          const firstCellPos = findCellPos($first)
          const lastCellPos = findCellPos($last)
          if (firstCellPos != null && lastCellPos != null) {
            const sel = CellSelection.create(view.state.doc, firstCellPos, lastCellPos)
            view.dispatch(view.state.tr.setSelection(sel))
          }
        } catch (err) { console.warn('selectAll failed:', err) }
      }
    }
  })
  cornerBtn.addEventListener('mouseenter', () => showHighlightOverlay('table', table))
  cornerBtn.addEventListener('mouseleave', clearHighlights)
  container.appendChild(cornerBtn)

  // --- 2. 列头（A, B, C...）常驻显示 ---
  for (let c = 0; c < firstRowCells.length; c++) {
    const cr = firstRowCells[c].getBoundingClientRect()
    const colHeader = document.createElement('div')
    colHeader.className = 'tc-col-header'
    colHeader.textContent = colToLetter(c)
    colHeader.title = '选择整列'
    colHeader.style.cssText = `
      left:${cr.left - wrapperRect.left}px;
      top:${tTop - GUTTER}px;
      width:${cr.width}px;
      height:${GUTTER - 1}px;
    `
    const ci = c
    colHeader.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      _headerSelectFlag = true
      selectCol(view, editor, table, ci)
    })
    colHeader.addEventListener('mouseenter', () => showHighlightOverlay('col', table, ci))
    colHeader.addEventListener('mouseleave', clearHighlights)
    container.appendChild(colHeader)
  }

  // --- 3. 行号（1, 2, 3...）常驻显示 ---
  for (let r = 0; r < rows.length; r++) {
    const rr = rows[r].getBoundingClientRect()
    const rowHeader = document.createElement('div')
    rowHeader.className = 'tc-row-header'
    rowHeader.textContent = String(r + 1)
    rowHeader.title = '选择整行'
    rowHeader.style.cssText = `
      left:${tLeft - GUTTER}px;
      top:${rr.top - wrapperRect.top}px;
      width:${GUTTER - 1}px;
      height:${rr.height}px;
    `
    const ri = r
    rowHeader.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      _headerSelectFlag = true
      selectRow(view, editor, table, ri)
    })
    rowHeader.addEventListener('mouseenter', () => showHighlightOverlay('row', table, ri))
    rowHeader.addEventListener('mouseleave', clearHighlights)
    container.appendChild(rowHeader)
  }

  // --- 找到鼠标所在的行和列 ---
  let hoverRowIdx = -1, hoverColIdx = -1
  for (let r = 0; r < rows.length; r++) {
    const rr = rows[r].getBoundingClientRect()
    if (mouseY >= rr.top && mouseY <= rr.bottom) { hoverRowIdx = r; break }
  }
  for (let c = 0; c < firstRowCells.length; c++) {
    const cr = firstRowCells[c].getBoundingClientRect()
    if (mouseX >= cr.left && mouseX <= cr.right) { hoverColIdx = c; break }
  }

  // --- 4. hover 行时高亮对应行号 ---
  if (hoverRowIdx >= 0) {
    const headers = container.querySelectorAll('.tc-row-header')
    if (headers[hoverRowIdx]) headers[hoverRowIdx].classList.add('tc-header-hover')
  }
  if (hoverColIdx >= 0) {
    const headers = container.querySelectorAll('.tc-col-header')
    if (headers[hoverColIdx]) headers[hoverColIdx].classList.add('tc-header-hover')
  }

  // --- 5. 当前行的删除按钮（左侧，行号左边） ---
  if (hoverRowIdx >= 0) {
    const rr = rows[hoverRowIdx].getBoundingClientRect()
    const btn = createBtn('tc-btn tc-del-row tc-visible', ICON_TRASH, '删除此行')
    btn.style.left = `${tLeft - GUTTER - 22}px`
    btn.style.top = `${rr.top - wrapperRect.top + rr.height / 2 - 10}px`
    const ri = hoverRowIdx
    btn.addEventListener('mouseenter', () => showHighlightOverlay('row', table, ri))
    btn.addEventListener('mouseleave', clearHighlights)
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      focusCellAt(view, editor, table, ri, 0)
      setTimeout(() => editor.chain().focus().deleteRow().run(), 10)
    })
    container.appendChild(btn)
  }

  // --- 6. 当前列的删除按钮（顶部，列头上面） ---
  if (hoverColIdx >= 0) {
    const cr = firstRowCells[hoverColIdx].getBoundingClientRect()
    const btn = createBtn('tc-btn tc-del-col tc-visible', ICON_TRASH, '删除此列')
    btn.style.left = `${cr.left - wrapperRect.left + cr.width / 2 - 10}px`
    btn.style.top = `${tTop - GUTTER - 22}px`
    const ci = hoverColIdx
    btn.addEventListener('mouseenter', () => showHighlightOverlay('col', table, ci))
    btn.addEventListener('mouseleave', clearHighlights)
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      focusCellAt(view, editor, table, 0, ci)
      setTimeout(() => editor.chain().focus().deleteColumn().run(), 10)
    })
    container.appendChild(btn)
  }

  // --- 按钮创建完毕后，检查鼠标是否已在某个删除按钮上，立即触发高亮 ---
  const allBtns = container.querySelectorAll('.tc-del-row, .tc-del-col')
  for (const btn of allBtns) {
    if (isMouseOverBtn(btn)) {
      if (btn.classList.contains('tc-del-row') && hoverRowIdx >= 0) {
        showHighlightOverlay('row', table, hoverRowIdx)
      } else if (btn.classList.contains('tc-del-col') && hoverColIdx >= 0) {
        showHighlightOverlay('col', table, hoverColIdx)
      }
      break
    }
  }

  // --- 7. 靠近行间线时显示"+"插入行 ---
  for (let i = 0; i <= rows.length; i++) {
    let lineY
    if (i === 0) lineY = rows[0].getBoundingClientRect().top
    else if (i === rows.length) lineY = rows[i - 1].getBoundingClientRect().bottom
    else {
      const p = rows[i - 1].getBoundingClientRect()
      const n = rows[i].getBoundingClientRect()
      lineY = (p.bottom + n.top) / 2
    }
    if (Math.abs(mouseY - lineY) <= EDGE_THRESHOLD) {
      const btn = createBtn('tc-btn tc-add-row tc-visible', ICON_PLUS, '插入行')
      btn.style.left = `${tLeft - GUTTER - 22}px`
      btn.style.top = `${lineY - wrapperRect.top - 10}px`
      const ri = i
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation()
        if (ri === rows.length) {
          focusCellAt(view, editor, table, ri - 1, 0)
          setTimeout(() => editor.chain().focus().addRowAfter().run(), 10)
        } else {
          focusCellAt(view, editor, table, ri, 0)
          setTimeout(() => editor.chain().focus().addRowBefore().run(), 10)
        }
      })
      container.appendChild(btn)
      break
    }
  }

  // --- 8. 靠近列间线时显示"+"插入列 ---
  for (let i = 0; i <= firstRowCells.length; i++) {
    let lineX
    if (i === 0) lineX = firstRowCells[0].getBoundingClientRect().left
    else if (i === firstRowCells.length) lineX = firstRowCells[i - 1].getBoundingClientRect().right
    else {
      const p = firstRowCells[i - 1].getBoundingClientRect()
      const n = firstRowCells[i].getBoundingClientRect()
      lineX = (p.right + n.left) / 2
    }
    if (Math.abs(mouseX - lineX) <= EDGE_THRESHOLD) {
      const btn = createBtn('tc-btn tc-add-col tc-visible', ICON_PLUS, '插入列')
      btn.style.left = `${lineX - wrapperRect.left - 10}px`
      btn.style.top = `${tTop - GUTTER - 22}px`
      const ci = i
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation()
        if (ci === firstRowCells.length) {
          focusCellAt(view, editor, table, 0, ci - 1)
          setTimeout(() => editor.chain().focus().addColumnAfter().run(), 10)
        } else {
          focusCellAt(view, editor, table, 0, ci)
          setTimeout(() => editor.chain().focus().addColumnBefore().run(), 10)
        }
      })
      container.appendChild(btn)
      break
    }
  }
}

/** 选中单元格后的浮动操作菜单 */
function renderSelectionMenu(editor) {
  removeSelectionMenu()
  const cells = document.querySelectorAll('.editor-area .tiptap table .selectedCell')
  if (cells.length < 2) return

  let minL = Infinity, maxR = -Infinity, maxB = -Infinity, minT = Infinity
  cells.forEach(c => {
    const r = c.getBoundingClientRect()
    if (r.left < minL) minL = r.left
    if (r.right > maxR) maxR = r.right
    if (r.bottom > maxB) maxB = r.bottom
    if (r.top < minT) minT = r.top
  })

  const menu = document.createElement('div')
  menu.className = 'tc-selection-menu'
  const actions = [
    { label: '合并单元格', cmd: () => editor.chain().focus().mergeCells().run() },
    { label: '拆分单元格', cmd: () => editor.chain().focus().splitCell().run() },
    { sep: true },
    { label: '在上方插入行', cmd: () => editor.chain().focus().addRowBefore().run() },
    { label: '在下方插入行', cmd: () => editor.chain().focus().addRowAfter().run() },
    { label: '在左侧插入列', cmd: () => editor.chain().focus().addColumnBefore().run() },
    { label: '在右侧插入列', cmd: () => editor.chain().focus().addColumnAfter().run() },
    { sep: true },
    { label: '删除行', cmd: () => editor.chain().focus().deleteRow().run(), danger: true },
    { label: '删除列', cmd: () => editor.chain().focus().deleteColumn().run(), danger: true },
    { label: '删除表格', cmd: () => editor.chain().focus().deleteTable().run(), danger: true },
  ]
  actions.forEach(item => {
    if (item.sep) { const s = document.createElement('div'); s.className = 'tc-menu-sep'; menu.appendChild(s); return }
    const btn = document.createElement('button')
    btn.className = 'tc-menu-btn' + (item.danger ? ' danger' : '')
    btn.textContent = item.label
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); item.cmd(); removeSelectionMenu() })
    menu.appendChild(btn)
  })
  menu.style.cssText = `position:fixed;left:${(minL+maxR)/2}px;top:${maxB+6}px;transform:translateX(-50%);z-index:200;`
  document.body.appendChild(menu)
  requestAnimationFrame(() => {
    if (!menu.parentElement) return
    const mr = menu.getBoundingClientRect()
    if (mr.left < 8) menu.style.left = `${8 + mr.width/2}px`
    if (mr.right > window.innerWidth - 8) menu.style.left = `${window.innerWidth - 8 - mr.width/2}px`
    if (mr.bottom > window.innerHeight - 8) menu.style.top = `${minT - mr.height - 6}px`
  })
}

function removeSelectionMenu() {
  const old = document.querySelector('.tc-selection-menu')
  if (old) old.remove()
}

/** 右键上下文菜单 */
function showContextMenu(editor, view, e) {
  removeContextMenu()
  const table = findClosestTable(e.target)
  if (!table) return

  const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })
  if (pos) editor.commands.setTextSelection(pos.pos)

  const menu = document.createElement('div')
  menu.className = 'tc-context-menu'

  const selectedCells = table.querySelectorAll('.selectedCell')
  const canMerge = selectedCells.length >= 2
  const cell = e.target.closest('td, th')
  const canSplit = cell && (
    (cell.getAttribute('colspan') && parseInt(cell.getAttribute('colspan')) > 1) ||
    (cell.getAttribute('rowspan') && parseInt(cell.getAttribute('rowspan')) > 1)
  )

  const actions = [
    { label: '合并单元格', cmd: () => editor.chain().focus().mergeCells().run(), disabled: !canMerge },
    { label: '拆分单元格', cmd: () => editor.chain().focus().splitCell().run(), disabled: !canSplit },
    { sep: true },
    { label: '在上方插入行', cmd: () => editor.chain().focus().addRowBefore().run() },
    { label: '在下方插入行', cmd: () => editor.chain().focus().addRowAfter().run() },
    { label: '在左侧插入列', cmd: () => editor.chain().focus().addColumnBefore().run() },
    { label: '在右侧插入列', cmd: () => editor.chain().focus().addColumnAfter().run() },
    { sep: true },
    { label: '删除行', cmd: () => editor.chain().focus().deleteRow().run(), danger: true },
    { label: '删除列', cmd: () => editor.chain().focus().deleteColumn().run(), danger: true },
    { label: '删除表格', cmd: () => editor.chain().focus().deleteTable().run(), danger: true },
  ]

  actions.forEach(item => {
    if (item.sep) {
      const s = document.createElement('div')
      s.className = 'tc-menu-sep'
      menu.appendChild(s)
      return
    }
    const btn = document.createElement('button')
    btn.className = 'tc-menu-btn' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '')
    btn.textContent = item.label
    if (item.disabled) {
      btn.setAttribute('disabled', 'true')
    } else {
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        item.cmd()
        removeContextMenu()
      })
    }
    menu.appendChild(btn)
  })

  menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:300;`
  document.body.appendChild(menu)

  requestAnimationFrame(() => {
    if (!menu.parentElement) return
    const mr = menu.getBoundingClientRect()
    if (mr.right > window.innerWidth - 8) menu.style.left = `${e.clientX - mr.width}px`
    if (mr.bottom > window.innerHeight - 8) menu.style.top = `${e.clientY - mr.height}px`
  })
}

function removeContextMenu() {
  const old = document.querySelector('.tc-context-menu')
  if (old) old.remove()
}

/** Tiptap Extension */
export const TableControls = Extension.create({
  name: 'tableControls',
  onCreate() {
    const editor = this.editor
    const editorDom = editor.view.dom
    const scrollEl = editorDom.closest('.editor-content')
    let currentTable = null, container = null

    function cleanup() {
      clearHighlights()
      if (container && container.parentElement) container.parentElement.removeChild(container)
      container = null; currentTable = null
    }

    const onMouseMove = (e) => {
      const target = e.target
      // 鼠标在控件按钮/行号列头上时，不重建控件
      if (container && container.contains(target)) {
        const btn = target.closest('.tc-btn')
        const isDel = btn && (btn.classList.contains('tc-del-row') || btn.classList.contains('tc-del-col'))
        if (isDel && currentTable) {
          const rows = Array.from(currentTable.querySelectorAll('tr'))
          const firstRowCells = rows.length ? Array.from(rows[0].children) : []
          if (btn.classList.contains('tc-del-row')) {
            const btnY = btn.getBoundingClientRect().top + btn.getBoundingClientRect().height / 2
            for (let r = 0; r < rows.length; r++) {
              const rr = rows[r].getBoundingClientRect()
              if (btnY >= rr.top && btnY <= rr.bottom) {
                showHighlightOverlay('row', currentTable, r)
                break
              }
            }
          } else if (btn.classList.contains('tc-del-col')) {
            const btnX = btn.getBoundingClientRect().left + btn.getBoundingClientRect().width / 2
            for (let c = 0; c < firstRowCells.length; c++) {
              const cr = firstRowCells[c].getBoundingClientRect()
              if (btnX >= cr.left && btnX <= cr.right) {
                showHighlightOverlay('col', currentTable, c)
                break
              }
            }
          }
        } else if (!target.closest('.tc-row-header, .tc-col-header, .tc-corner-btn')) {
          clearHighlights()
        }
        return
      }

      const table = findClosestTable(target)
      if (!table) { if (currentTable) cleanup(); return }

      if (table !== currentTable) {
        cleanup()
        currentTable = table
        container = document.createElement('div')
        container.className = 'table-controls-layer'
        const wrapper = table.closest('.tableWrapper') || table.parentElement
        if (wrapper) {
          wrapper.style.position = 'relative'
          wrapper.appendChild(container)
        }
      }
      if (container) renderHoverControls(editor.view, table, container, editor, e.clientX, e.clientY)
    }

    const onMouseLeave = () => {
      setTimeout(() => {
        const h = document.querySelector('.table-controls-layer:hover, .table-controls-layer *:hover')
        if (!h) { const t = document.querySelector('.editor-area table:hover'); if (!t) cleanup() }
      }, 150)
    }

    const onScroll = () => { if (currentTable) cleanup() }

    const onContextMenu = (e) => {
      const table = findClosestTable(e.target)
      if (!table) return
      e.preventDefault()
      showContextMenu(editor, editor.view, e)
    }

    const onDocClick = () => removeContextMenu()

    editorDom.addEventListener('mousemove', onMouseMove)
    editorDom.addEventListener('mouseleave', onMouseLeave)
    editorDom.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('mousedown', onDocClick)
    if (scrollEl) scrollEl.addEventListener('scroll', onScroll, { passive: true })

    const onTransaction = () => {
      const sel = document.querySelectorAll('.editor-area .tiptap table .selectedCell')
      if (sel.length >= 2 && !_headerSelectFlag) requestAnimationFrame(() => renderSelectionMenu(editor))
      else removeSelectionMenu()
      _headerSelectFlag = false
      if (currentTable && !currentTable.isConnected) cleanup()
    }
    editor.on('transaction', onTransaction)

    this.storage.destroy = () => {
      cleanup(); removeSelectionMenu(); removeContextMenu()
      editorDom.removeEventListener('mousemove', onMouseMove)
      editorDom.removeEventListener('mouseleave', onMouseLeave)
      editorDom.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('mousedown', onDocClick)
      if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
      editor.off('transaction', onTransaction)
    }
  },
  onDestroy() { if (this.storage.destroy) this.storage.destroy() },
})
