import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import './style.css'

type CompareStatus = 'match' | 'size_mismatch' | 'missing_left' | 'missing_right'
type FilterKey = 'all' | 'match' | 'size_mismatch' | 'missing'
const PAGE_SIZE = 10

type ImageSize = {
  width: number
  height: number
}

type CompareResult = {
  fileName: string
  leftPath: string | null
  rightPath: string | null
  leftSize: ImageSize | null
  rightSize: ImageSize | null
  leftError: string | null
  rightError: string | null
  status: CompareStatus
  message: string
}

type PreviewPayload = {
  dataUrl: string
}

type ViewState = 'idle' | 'running' | 'done' | 'error'

type PreviewState = {
  left: string | null
  right: string | null
  loading: boolean
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('App root was not found')
}

app.innerHTML = `
  <main class="shell">
    <section class="hero-panel">
      <div>
        <p class="eyebrow">Windows Desktop Utility</p>
        <h1>图片尺寸对比</h1>
        <p class="hero-copy">
          选择两个文件夹，逐项比较同名图片的宽高。任何尺寸不一致或文件缺失，都会直接标记为异常。
        </p>
      </div>
      <div class="hero-metrics">
        <article>
          <span>比较范围</span>
          <strong>第一层文件</strong>
        </article>
        <article>
          <span>支持格式</span>
          <strong>PNG / JPG / WEBP / GIF</strong>
        </article>
      </div>
    </section>

    <section class="controls-panel">
      <div class="folder-grid">
        <div class="folder-card">
          <div class="drop-hint">支持从资源管理器直接拖入文件夹</div>
          <div class="folder-card__head">
            <span class="folder-badge">文件夹 A</span>
            <button id="pick-left" class="button secondary" type="button">选择文件夹</button>
          </div>
          <p id="left-path" class="path-text empty">尚未选择路径</p>
        </div>
        <div class="folder-card">
          <div class="drop-hint">支持从资源管理器直接拖入文件夹</div>
          <div class="folder-card__head">
            <span class="folder-badge">文件夹 B</span>
            <button id="pick-right" class="button secondary" type="button">选择文件夹</button>
          </div>
          <p id="right-path" class="path-text empty">尚未选择路径</p>
        </div>
      </div>

      <div class="action-row">
        <button id="start-compare" class="button primary" type="button">开始比对</button>
        <div class="status-stack">
          <p id="run-state" class="status-pill status-idle">未开始</p>
          <p id="feedback" class="feedback">请选择两个不同的文件夹后开始比对。</p>
        </div>
      </div>
    </section>

    <section class="workspace">
      <div class="results-panel">
        <div class="section-head">
          <div>
            <p class="section-kicker">对比结果</p>
            <h2>文件列表</h2>
          </div>
          <div id="summary" class="summary">尚未开始比对</div>
        </div>
        <div class="filters-row">
          <div id="filters" class="filters">
            <button class="filter-chip is-active" type="button" data-filter="all">全部</button>
            <button class="filter-chip" type="button" data-filter="match">一致</button>
            <button class="filter-chip" type="button" data-filter="size_mismatch">尺寸异常</button>
            <button class="filter-chip" type="button" data-filter="missing">文件缺失</button>
          </div>
          <label class="toggle-filter">
            <input id="wordpic-only" type="checkbox" />
            <span>仅显示wordpic</span>
          </label>
        </div>
        <div id="results" class="results-empty">
          <p>暂无符合条件结果</p>
        </div>
        <div id="pagination" class="pagination is-hidden">
          <button id="page-prev" class="pagination-button" type="button">上一页</button>
          <div id="page-numbers" class="pagination-pages"></div>
          <p id="page-info" class="pagination-info">共 0 条</p>
          <button id="page-next" class="pagination-button" type="button">下一页</button>
        </div>
      </div>

      <aside class="preview-panel">
        <div class="section-head">
          <div>
            <p class="section-kicker">图片预览</p>
            <h2>当前选中项</h2>
          </div>
        </div>
        <div id="preview-meta" class="preview-meta empty">
          请选择一条比对结果查看两边图片和尺寸详情。
        </div>
        <div class="preview-grid">
          <section class="preview-card">
            <header>
              <span class="folder-badge">文件夹 A</span>
              <strong id="left-dim">未加载</strong>
            </header>
            <div id="left-preview" class="preview-box empty">暂无预览</div>
          </section>
          <section class="preview-card">
            <header>
              <span class="folder-badge">文件夹 B</span>
              <strong id="right-dim">未加载</strong>
            </header>
            <div id="right-preview" class="preview-box empty">暂无预览</div>
          </section>
        </div>
      </aside>
    </section>
  </main>
`

const pickLeftButton = must<HTMLButtonElement>('#pick-left')
const pickRightButton = must<HTMLButtonElement>('#pick-right')
const startCompareButton = must<HTMLButtonElement>('#start-compare')
const folderCards = Array.from(document.querySelectorAll<HTMLElement>('.folder-card'))
const leftPathElement = must<HTMLParagraphElement>('#left-path')
const rightPathElement = must<HTMLParagraphElement>('#right-path')
const runStateElement = must<HTMLParagraphElement>('#run-state')
const feedbackElement = must<HTMLParagraphElement>('#feedback')
const summaryElement = must<HTMLDivElement>('#summary')
const filtersElement = must<HTMLDivElement>('#filters')
const wordpicOnlyElement = must<HTMLInputElement>('#wordpic-only')
const resultsElement = must<HTMLDivElement>('#results')
const paginationElement = must<HTMLDivElement>('#pagination')
const pagePrevButton = must<HTMLButtonElement>('#page-prev')
const pageNextButton = must<HTMLButtonElement>('#page-next')
const pageNumbersElement = must<HTMLDivElement>('#page-numbers')
const pageInfoElement = must<HTMLParagraphElement>('#page-info')
const previewMetaElement = must<HTMLDivElement>('#preview-meta')
const leftPreviewElement = must<HTMLDivElement>('#left-preview')
const rightPreviewElement = must<HTMLDivElement>('#right-preview')
const leftDimensionElement = must<HTMLElement>('#left-dim')
const rightDimensionElement = must<HTMLElement>('#right-dim')

const state: {
  leftPath: string | null
  rightPath: string | null
  results: CompareResult[]
  selectedKey: string | null
  activeFilter: FilterKey
  wordpicOnly: boolean
  currentPage: number
  viewState: ViewState
  errorMessage: string | null
  preview: PreviewState
  dropTarget: 'left' | 'right' | null
} = {
  leftPath: null,
  rightPath: null,
  results: [],
  selectedKey: null,
  activeFilter: 'all',
  wordpicOnly: false,
  currentPage: 1,
  viewState: 'idle',
  errorMessage: null,
  preview: {
    left: null,
    right: null,
    loading: false
  },
  dropTarget: null
}

let previewRequestToken = 0

pickLeftButton.addEventListener('click', async () => {
  const selected = await selectFolder()
  if (!selected) return
  state.leftPath = selected
  state.errorMessage = null
  render()
})

pickRightButton.addEventListener('click', async () => {
  const selected = await selectFolder()
  if (!selected) return
  state.rightPath = selected
  state.errorMessage = null
  render()
})

filtersElement.querySelectorAll<HTMLButtonElement>('.filter-chip').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter as FilterKey | undefined
    if (!filter || filter === state.activeFilter) {
      return
    }
    state.activeFilter = filter
    state.currentPage = 1
    renderResults()
  })
})

wordpicOnlyElement.addEventListener('change', () => {
  state.wordpicOnly = wordpicOnlyElement.checked
  state.currentPage = 1
  renderResults()
})

pagePrevButton.addEventListener('click', () => {
  if (state.currentPage <= 1) {
    return
  }
  state.currentPage -= 1
  renderResults()
})

pageNextButton.addEventListener('click', () => {
  const totalPages = getTotalPages()
  if (state.currentPage >= totalPages) {
    return
  }
  state.currentPage += 1
  renderResults()
})

startCompareButton.addEventListener('click', async () => {
  if (!state.leftPath || !state.rightPath) {
    state.viewState = 'error'
    state.errorMessage = '请先选择两个文件夹。'
    render()
    return
  }

  if (state.leftPath === state.rightPath) {
    state.viewState = 'error'
    state.errorMessage = '两个文件夹路径不能相同。'
    render()
    return
  }

  state.viewState = 'running'
  state.errorMessage = null
  render()

  try {
    const results = await invoke<CompareResult[]>('compare_image_folders', {
      leftPath: state.leftPath,
      rightPath: state.rightPath
    })

    state.results = results
    state.currentPage = 1
    state.selectedKey = pickInitialSelection(results)
    state.viewState = 'done'
    render()
    void updatePreview()
  } catch (error) {
    state.viewState = 'error'
    state.errorMessage = stringifyError(error)
    render()
  }
})

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element
}

async function selectFolder(): Promise<string | null> {
  try {
    return await invoke<string | null>('select_folder')
  } catch (error) {
    state.viewState = 'error'
    state.errorMessage = `选择文件夹失败：${stringifyError(error)}`
    render()
    return null
  }
}

function pickInitialSelection(results: CompareResult[]): string | null {
  const firstMismatch = results.find((item) => item.status !== 'match')
  return firstMismatch?.fileName ?? results[0]?.fileName ?? null
}

async function attachDragDrop(): Promise<void> {
  const unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
    switch (event.payload.type) {
      case 'enter':
      case 'over':
        state.dropTarget = getDropTarget(event.payload.position)
        renderDropTargets()
        break
      case 'drop': {
        const target = getDropTarget(event.payload.position)
        state.dropTarget = null
        renderDropTargets()

        if (!target) {
          return
        }

        const droppedPath = event.payload.paths[0]
        if (!droppedPath) {
          return
        }

        try {
          const normalized = await invoke<string>('normalize_folder_path', { path: droppedPath })
          if (target === 'left') {
            state.leftPath = normalized
          } else {
            state.rightPath = normalized
          }
          state.errorMessage = null
          render()
        } catch (error) {
          state.viewState = 'error'
          state.errorMessage = `拖入失败：${stringifyError(error)}`
          render()
        }
        break
      }
      case 'leave':
        state.dropTarget = null
        renderDropTargets()
        break
    }
  })

  window.addEventListener('beforeunload', () => {
    void unlisten()
  })
}

async function updatePreview(): Promise<void> {
  const selected = state.results.find((item) => item.fileName === state.selectedKey)
  previewRequestToken += 1
  const currentToken = previewRequestToken

  if (!selected) {
    state.preview = { left: null, right: null, loading: false }
    renderPreview()
    return
  }

  state.preview = { left: null, right: null, loading: true }
  renderPreview()

  try {
    const [left, right] = await Promise.all([
      selected.leftPath ? loadPreview(selected.leftPath) : Promise.resolve(null),
      selected.rightPath ? loadPreview(selected.rightPath) : Promise.resolve(null)
    ])

    if (currentToken !== previewRequestToken) {
      return
    }

    state.preview = {
      left,
      right,
      loading: false
    }
    renderPreview()
  } catch (error) {
    if (currentToken !== previewRequestToken) {
      return
    }

    state.preview = { left: null, right: null, loading: false }
    state.errorMessage = `加载预览失败：${stringifyError(error)}`
    render()
  }
}

async function loadPreview(path: string): Promise<string> {
  try {
    const payload = await invoke<PreviewPayload>('load_image_preview', { path })
    return payload.dataUrl
  } catch {
    return ''
  }
}

function render(): void {
  renderPaths()
  renderStatus()
  renderSummary()
  renderDropTargets()
  renderResults()
  renderPreview()
}

function renderPaths(): void {
  applyPath(leftPathElement, state.leftPath)
  applyPath(rightPathElement, state.rightPath)
}

function applyPath(element: HTMLElement, value: string | null): void {
  element.textContent = value ?? '尚未选择路径'
  element.classList.toggle('empty', !value)
}

function renderStatus(): void {
  const labelByState: Record<ViewState, string> = {
    idle: '未开始',
    running: '比对中',
    done: '已完成',
    error: '发生错误'
  }

  runStateElement.textContent = labelByState[state.viewState]
  runStateElement.className = `status-pill status-${state.viewState}`

  if (state.viewState === 'running') {
    feedbackElement.textContent = '正在读取文件夹并比较同名图片尺寸，请稍候。'
  } else if (state.errorMessage) {
    feedbackElement.textContent = state.errorMessage
  } else if (state.viewState === 'done') {
    if (!state.results.length) {
      feedbackElement.textContent = '两个文件夹中未找到可比较的同名图片。'
    } else {
      const mismatchCount = state.results.filter((item) => item.status !== 'match').length
      feedbackElement.textContent =
        mismatchCount > 0 ? `发现 ${mismatchCount} 项异常，请在列表中查看。` : '全部同名图片尺寸一致。'
    }
  } else {
    feedbackElement.textContent = '请选择两个不同的文件夹后开始比对。'
  }

  startCompareButton.disabled = state.viewState === 'running'
}

function renderSummary(): void {
  if (!state.results.length) {
    summaryElement.textContent = '尚未开始比对'
    return
  }

  const total = state.results.length
  const matched = state.results.filter((item) => item.status === 'match').length
  const issues = total - matched

  summaryElement.textContent = `共 ${total} 项，${matched} 项一致，${issues} 项异常`
}

function renderResults(): void {
  filtersElement.classList.toggle('is-disabled', !state.results.length)
  filtersElement.querySelectorAll<HTMLButtonElement>('.filter-chip').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.filter === state.activeFilter)
  })

  const visibleResults = getVisibleResults()

  if (!state.results.length) {
    resultsElement.className = 'results-empty'
    resultsElement.innerHTML = '<p>暂无符合条件结果</p>'
    renderPagination(0)
    return
  }

  if (!visibleResults.length) {
    resultsElement.className = 'results-empty'
    resultsElement.innerHTML = '<p>暂无符合条件结果</p>'
    renderPagination(0)
    return
  }

  const totalPages = getTotalPages(visibleResults)
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages
  }

  const pageStart = (state.currentPage - 1) * PAGE_SIZE
  const pagedResults = visibleResults.slice(pageStart, pageStart + PAGE_SIZE)

  const rows = pagedResults
    .map((item) => {
      const selected = item.fileName === state.selectedKey ? ' is-selected' : ''
      return `
        <button class="result-row status-${item.status}${selected}" type="button" data-file-name="${escapeAttribute(item.fileName)}">
          <div class="result-row__main">
            <strong>${escapeHtml(item.fileName)}</strong>
            <span>${escapeHtml(item.message)}</span>
          </div>
          <div class="result-row__sizes">
            <span>A：${formatSize(item.leftSize)}</span>
            <span>B：${formatSize(item.rightSize)}</span>
          </div>
          <div class="result-row__status">${statusLabel(item.status)}</div>
        </button>
      `
    })
    .join('')

  resultsElement.className = 'results-list'
  resultsElement.innerHTML = rows
  renderPagination(visibleResults.length)

  resultsElement.querySelectorAll<HTMLButtonElement>('.result-row').forEach((button) => {
    button.addEventListener('click', () => {
      const fileName = button.dataset.fileName
      if (!fileName || fileName === state.selectedKey) {
        return
      }
      state.selectedKey = fileName
      renderResults()
      void updatePreview()
    })
  })
}

function renderPagination(totalItems: number): void {
  if (totalItems <= PAGE_SIZE) {
    paginationElement.classList.add('is-hidden')
    return
  }

  const totalPages = getTotalPages(undefined, totalItems)
  paginationElement.classList.remove('is-hidden')
  pageInfoElement.textContent = `共 ${totalItems} 条`
  pagePrevButton.disabled = state.currentPage <= 1
  pageNextButton.disabled = state.currentPage >= totalPages
  pageNumbersElement.innerHTML = buildPageButtons(totalPages)

  pageNumbersElement.querySelectorAll<HTMLButtonElement>('.pagination-page').forEach((button) => {
    button.addEventListener('click', () => {
      const page = Number(button.dataset.page)
      if (!page || page === state.currentPage) {
        return
      }
      state.currentPage = page
      renderResults()
    })
  })
}

function getVisibleResults(): CompareResult[] {
  switch (state.activeFilter) {
    case 'all':
      return applyWordpicFilter(state.results)
    case 'match':
      return applyWordpicFilter(state.results.filter((item) => item.status === 'match'))
    case 'size_mismatch':
      return applyWordpicFilter(state.results.filter((item) => item.status === 'size_mismatch'))
    case 'missing':
      return applyWordpicFilter(
        state.results.filter(
          (item) => item.status === 'missing_left' || item.status === 'missing_right'
        )
      )
  }
}

function applyWordpicFilter(results: CompareResult[]): CompareResult[] {
  if (!state.wordpicOnly) {
    return results
  }

  return results.filter((item) => item.fileName.toLowerCase().includes('wordpic'))
}

function getTotalPages(source = getVisibleResults(), totalItems = source.length): number {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
}

function buildPageButtons(totalPages: number): string {
  const pages = getPageWindow(totalPages, state.currentPage)
  return pages
    .map((page) => {
      if (page === 'ellipsis') {
        return '<span class="pagination-ellipsis">…</span>'
      }

      const activeClass = page === state.currentPage ? ' is-active' : ''
      return `<button class="pagination-page${activeClass}" type="button" data-page="${page}">${page}</button>`
    })
    .join('')
}

function getPageWindow(totalPages: number, currentPage: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages]
  }

  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
  }

  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages]
}

function renderDropTargets(): void {
  folderCards.forEach((card, index) => {
    const target = index === 0 ? 'left' : 'right'
    card.classList.toggle('is-drop-target', state.dropTarget === target)
  })
}

function getDropTarget(position: { x: number; y: number }): 'left' | 'right' | null {
  const element = document.elementFromPoint(position.x, position.y)
  const card = element?.closest<HTMLElement>('.folder-card')
  if (!card) {
    return null
  }

  const index = folderCards.indexOf(card)
  if (index === 0) return 'left'
  if (index === 1) return 'right'
  return null
}

function renderPreview(): void {
  const selected = state.results.find((item) => item.fileName === state.selectedKey)
  if (!selected) {
    previewMetaElement.textContent = '请选择一条比对结果查看两边图片和尺寸详情。'
    previewMetaElement.className = 'preview-meta empty'
    leftDimensionElement.textContent = '未加载'
    rightDimensionElement.textContent = '未加载'
    leftPreviewElement.className = 'preview-box empty'
    rightPreviewElement.className = 'preview-box empty'
    leftPreviewElement.textContent = '暂无预览'
    rightPreviewElement.textContent = '暂无预览'
    return
  }

  previewMetaElement.textContent = selected.message
  previewMetaElement.className = `preview-meta tone-${selected.status}`
  leftDimensionElement.textContent = formatSize(selected.leftSize)
  rightDimensionElement.textContent = formatSize(selected.rightSize)

  if (state.preview.loading) {
    leftPreviewElement.className = 'preview-box loading'
    rightPreviewElement.className = 'preview-box loading'
    leftPreviewElement.textContent = '加载中...'
    rightPreviewElement.textContent = '加载中...'
    return
  }

  renderPreviewImage(leftPreviewElement, state.preview.left, selected.leftPath, '文件夹 A 预览')
  renderPreviewImage(rightPreviewElement, state.preview.right, selected.rightPath, '文件夹 B 预览')
}

function renderPreviewImage(
  container: HTMLElement,
  dataUrl: string | null,
  sourcePath: string | null,
  alt: string
): void {
  if (!sourcePath) {
    container.className = 'preview-box empty'
    container.textContent = '此侧缺失文件'
    return
  }

  if (!dataUrl) {
    container.className = 'preview-box empty'
    container.textContent = '无法生成预览'
    return
  }

  container.className = 'preview-box'
  container.innerHTML = `<img src="${dataUrl}" alt="${escapeAttribute(alt)}" />`
}

function formatSize(size: ImageSize | null): string {
  return size ? `${size.width} × ${size.height}` : '缺失'
}

function statusLabel(status: CompareStatus): string {
  switch (status) {
    case 'match':
      return '一致'
    case 'size_mismatch':
      return '尺寸异常'
    case 'missing_left':
    case 'missing_right':
      return '文件缺失'
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

render()
void attachDragDrop()
