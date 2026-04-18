import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import './style.css'

type CompareMode = 'localized' | 'generic'
type LocalizedView = 'expanded' | 'grouped'
type CompareStatus = 'match' | 'size_mismatch' | 'missing_left' | 'missing_right'
type FilterKey = 'all' | 'match' | 'size_mismatch' | 'missing'

const PAGE_SIZE = 10

type ImageSize = {
  width: number
  height: number
}

type GenericCompareResult = {
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

type LocalizedCompareEntry = {
  fileName: string
  locale: string
  basePath: string | null
  localePath: string | null
  baseSize: ImageSize | null
  localeSize: ImageSize | null
  baseError: string | null
  localeError: string | null
  status: CompareStatus
  message: string
}

type LocalizedGroupedResult = {
  fileName: string
  locales: LocalizedCompareEntry[]
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

type GenericUIState = {
  leftPath: string | null
  rightPath: string | null
  results: GenericCompareResult[]
  selectedKey: string | null
  activeFilter: FilterKey
  wordpicOnly: boolean
  currentPage: number
}

type LocalizedUIState = {
  rootPath: string | null
  entries: LocalizedCompareEntry[]
  selectedExpandedKey: string | null
  selectedGroupedFile: string | null
  selectedGroupedLocale: string | null
  activeFilter: FilterKey
  wordpicOnly: boolean
  view: LocalizedView
  expandedPage: number
  groupedPage: number
}

type PreviewContext = {
  id: string
  leftLabel: string
  rightLabel: string
  leftPath: string | null
  rightPath: string | null
  leftSize: ImageSize | null
  rightSize: ImageSize | null
  leftError: string | null
  rightError: string | null
  message: string
  status: CompareStatus
  localeOptions?: string[]
  selectedLocale?: string | null
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
          支持通用双文件夹比对，也支持针对 Localize 目录结构的本地化资源一键比对。
        </p>
      </div>
      <div class="hero-metrics">
        <article>
          <span>默认模式</span>
          <strong>本地化模式</strong>
        </article>
        <article>
          <span>支持格式</span>
          <strong>PNG / JPG / JPEG / WEBP / BMP / GIF</strong>
        </article>
      </div>
    </section>

    <section class="controls-panel">
      <div class="mode-row">
        <div id="mode-tabs" class="mode-tabs">
          <button class="mode-tab is-active" type="button" data-mode="localized">本地化模式</button>
          <button class="mode-tab" type="button" data-mode="generic">通用模式</button>
        </div>
        <p id="mode-help" class="mode-help">请选择主目录 A，系统将自动扫描 Localize 子目录。</p>
      </div>

      <div id="localized-inputs" class="folder-grid folder-grid--single">
        <div class="folder-card" data-drop-target="localized-root">
          <div class="drop-hint">支持从资源管理器直接拖入主目录</div>
          <div class="folder-card__head">
            <span class="folder-badge">主目录 A</span>
            <button id="pick-root" class="button secondary" type="button">选择主目录</button>
          </div>
          <p class="folder-note">需包含 <code>Localize</code> 子目录，系统会自动扫描其中所有语言目录。</p>
          <p id="root-path" class="path-text empty">尚未选择路径</p>
        </div>
      </div>

      <div id="generic-inputs" class="folder-grid hidden">
        <div class="folder-card" data-drop-target="generic-left">
          <div class="drop-hint">支持从资源管理器直接拖入文件夹</div>
          <div class="folder-card__head">
            <span class="folder-badge">文件夹 A</span>
            <button id="pick-left" class="button secondary" type="button">选择文件夹</button>
          </div>
          <p id="left-path" class="path-text empty">尚未选择路径</p>
        </div>
        <div class="folder-card" data-drop-target="generic-right">
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
          <p id="feedback" class="feedback">请选择主目录 A，系统将自动扫描 Localize 子目录。</p>
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
          <div class="filters-left">
            <div id="filters" class="filters">
              <button class="filter-chip is-active" type="button" data-filter="all">全部</button>
              <button class="filter-chip" type="button" data-filter="match">一致</button>
              <button class="filter-chip" type="button" data-filter="size_mismatch">尺寸异常</button>
              <button class="filter-chip" type="button" data-filter="missing">文件缺失</button>
            </div>
            <div id="localized-view-toggle" class="view-toggle">
              <button class="view-chip is-active" type="button" data-view="expanded">按语言展开</button>
              <button class="view-chip" type="button" data-view="grouped">按图片聚合</button>
            </div>
          </div>
          <label class="toggle-filter">
            <input id="wordpic-only" type="checkbox" />
            <span>仅显示 WordPic</span>
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
            <h2 id="preview-title">当前选中项</h2>
          </div>
        </div>
        <div id="preview-locale-switch" class="locale-switch is-hidden"></div>
        <div id="preview-meta" class="preview-meta empty">请选择一条比对结果查看图片和尺寸详情。</div>
        <div class="preview-grid">
          <section class="preview-card">
            <header>
              <span id="preview-left-label" class="folder-badge">主目录 A</span>
              <strong id="left-dim">未加载</strong>
            </header>
            <div id="left-preview" class="preview-box empty">暂无预览</div>
          </section>
          <section class="preview-card">
            <header>
              <span id="preview-right-label" class="folder-badge">当前目标</span>
              <strong id="right-dim">未加载</strong>
            </header>
            <div id="right-preview" class="preview-box empty">暂无预览</div>
          </section>
        </div>
      </aside>
    </section>
  </main>
`

const modeTabsElement = must<HTMLDivElement>('#mode-tabs')
const modeHelpElement = must<HTMLParagraphElement>('#mode-help')
const localizedInputsElement = must<HTMLDivElement>('#localized-inputs')
const genericInputsElement = must<HTMLDivElement>('#generic-inputs')
const pickRootButton = must<HTMLButtonElement>('#pick-root')
const pickLeftButton = must<HTMLButtonElement>('#pick-left')
const pickRightButton = must<HTMLButtonElement>('#pick-right')
const rootPathElement = must<HTMLParagraphElement>('#root-path')
const leftPathElement = must<HTMLParagraphElement>('#left-path')
const rightPathElement = must<HTMLParagraphElement>('#right-path')
const startCompareButton = must<HTMLButtonElement>('#start-compare')
const folderCards = Array.from(document.querySelectorAll<HTMLElement>('.folder-card'))
const runStateElement = must<HTMLParagraphElement>('#run-state')
const feedbackElement = must<HTMLParagraphElement>('#feedback')
const summaryElement = must<HTMLDivElement>('#summary')
const filtersElement = must<HTMLDivElement>('#filters')
const localizedViewToggleElement = must<HTMLDivElement>('#localized-view-toggle')
const wordpicOnlyElement = must<HTMLInputElement>('#wordpic-only')
const resultsElement = must<HTMLDivElement>('#results')
const paginationElement = must<HTMLDivElement>('#pagination')
const pagePrevButton = must<HTMLButtonElement>('#page-prev')
const pageNextButton = must<HTMLButtonElement>('#page-next')
const pageNumbersElement = must<HTMLDivElement>('#page-numbers')
const pageInfoElement = must<HTMLParagraphElement>('#page-info')
const previewTitleElement = must<HTMLHeadingElement>('#preview-title')
const previewLocaleSwitchElement = must<HTMLDivElement>('#preview-locale-switch')
const previewMetaElement = must<HTMLDivElement>('#preview-meta')
const previewLeftLabelElement = must<HTMLSpanElement>('#preview-left-label')
const previewRightLabelElement = must<HTMLSpanElement>('#preview-right-label')
const leftPreviewElement = must<HTMLDivElement>('#left-preview')
const rightPreviewElement = must<HTMLDivElement>('#right-preview')
const leftDimensionElement = must<HTMLElement>('#left-dim')
const rightDimensionElement = must<HTMLElement>('#right-dim')

const state: {
  mode: CompareMode
  generic: GenericUIState
  localized: LocalizedUIState
  viewState: ViewState
  errorMessage: string | null
  preview: PreviewState
  dropTarget: 'generic-left' | 'generic-right' | 'localized-root' | null
} = {
  mode: 'localized',
  generic: {
    leftPath: null,
    rightPath: null,
    results: [],
    selectedKey: null,
    activeFilter: 'all',
    wordpicOnly: false,
    currentPage: 1
  },
  localized: {
    rootPath: null,
    entries: [],
    selectedExpandedKey: null,
    selectedGroupedFile: null,
    selectedGroupedLocale: null,
    activeFilter: 'all',
    wordpicOnly: false,
    view: 'expanded',
    expandedPage: 1,
    groupedPage: 1
  },
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

modeTabsElement.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as CompareMode | undefined
    if (!mode || mode === state.mode) {
      return
    }
    state.mode = mode
    state.errorMessage = null
    state.dropTarget = null
    render()
    void updatePreview()
  })
})

pickRootButton.addEventListener('click', async () => {
  const selected = await selectFolder()
  if (!selected) return
  state.localized.rootPath = selected
  state.errorMessage = null
  render()
})

pickLeftButton.addEventListener('click', async () => {
  const selected = await selectFolder()
  if (!selected) return
  state.generic.leftPath = selected
  state.errorMessage = null
  render()
})

pickRightButton.addEventListener('click', async () => {
  const selected = await selectFolder()
  if (!selected) return
  state.generic.rightPath = selected
  state.errorMessage = null
  render()
})

filtersElement.querySelectorAll<HTMLButtonElement>('.filter-chip').forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter as FilterKey | undefined
    if (!filter || filter === getActiveFilter()) {
      return
    }
    setActiveFilter(filter)
    setCurrentPage(1)
    renderResults()
    void updatePreview()
  })
})

localizedViewToggleElement.querySelectorAll<HTMLButtonElement>('.view-chip').forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view as LocalizedView | undefined
    if (!view || view === state.localized.view) {
      return
    }
    state.localized.view = view
    state.errorMessage = null
    renderResults()
    void updatePreview()
  })
})

wordpicOnlyElement.addEventListener('change', () => {
  setWordpicOnly(wordpicOnlyElement.checked)
  setCurrentPage(1)
  renderResults()
  void updatePreview()
})

pagePrevButton.addEventListener('click', () => {
  const currentPage = getCurrentPage()
  if (currentPage <= 1) {
    return
  }
  setCurrentPage(currentPage - 1)
  renderResults()
  void updatePreview()
})

pageNextButton.addEventListener('click', () => {
  const totalPages = getVisibleTotalPages()
  const currentPage = getCurrentPage()
  if (currentPage >= totalPages) {
    return
  }
  setCurrentPage(currentPage + 1)
  renderResults()
  void updatePreview()
})

startCompareButton.addEventListener('click', async () => {
  if (state.mode === 'generic') {
    await runGenericCompare()
  } else {
    await runLocalizedCompare()
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

async function runGenericCompare(): Promise<void> {
  const { leftPath, rightPath } = state.generic
  if (!leftPath || !rightPath) {
    state.viewState = 'error'
    state.errorMessage = '请先选择两个文件夹。'
    render()
    return
  }
  if (leftPath === rightPath) {
    state.viewState = 'error'
    state.errorMessage = '两个文件夹路径不能相同。'
    render()
    return
  }

  state.viewState = 'running'
  state.errorMessage = null
  render()

  try {
    const results = await invoke<GenericCompareResult[]>('compare_image_folders', {
      leftPath,
      rightPath
    })

    state.generic.results = results
    state.generic.currentPage = 1
    state.generic.selectedKey = pickInitialGenericSelection(results)
    state.viewState = 'done'
    render()
    void updatePreview()
  } catch (error) {
    state.viewState = 'error'
    state.errorMessage = stringifyError(error)
    render()
  }
}

async function runLocalizedCompare(): Promise<void> {
  const rootPath = state.localized.rootPath
  if (!rootPath) {
    state.viewState = 'error'
    state.errorMessage = '请先选择主目录 A。'
    render()
    return
  }

  state.viewState = 'running'
  state.errorMessage = null
  render()

  try {
    await invoke('validate_localized_root', { rootPath })
    const entries = await invoke<LocalizedCompareEntry[]>('compare_localized_folder', { rootPath })

    state.localized.entries = entries
    state.localized.expandedPage = 1
    state.localized.groupedPage = 1
    state.localized.selectedExpandedKey = pickInitialLocalizedExpandedSelection(entries)
    state.localized.selectedGroupedFile = pickInitialLocalizedGroupedFile(entries)
    state.localized.selectedGroupedLocale = pickInitialLocalizedGroupedLocale(entries)
    state.viewState = 'done'
    render()
    void updatePreview()
  } catch (error) {
    state.viewState = 'error'
    state.errorMessage = stringifyError(error)
    render()
  }
}

function pickInitialGenericSelection(results: GenericCompareResult[]): string | null {
  return results.find((item) => item.status !== 'match')?.fileName ?? results[0]?.fileName ?? null
}

function pickInitialLocalizedExpandedSelection(entries: LocalizedCompareEntry[]): string | null {
  const target = entries.find((item) => item.status !== 'match') ?? entries[0]
  return target ? localizedExpandedKey(target) : null
}

function pickInitialLocalizedGroupedFile(entries: LocalizedCompareEntry[]): string | null {
  const grouped = buildLocalizedGroupedResults(entries)
  return grouped.find((item) => item.status !== 'match')?.fileName ?? grouped[0]?.fileName ?? null
}

function pickInitialLocalizedGroupedLocale(entries: LocalizedCompareEntry[]): string | null {
  const grouped = buildLocalizedGroupedResults(entries)
  const targetGroup = grouped.find((item) => item.status !== 'match') ?? grouped[0]
  if (!targetGroup) {
    return null
  }
  return (
    targetGroup.locales.find((item) => item.status !== 'match')?.locale ??
    targetGroup.locales[0]?.locale ??
    null
  )
}

function localizedExpandedKey(entry: LocalizedCompareEntry): string {
  return `${entry.fileName}::${entry.locale}`
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
          if (target === 'generic-left') {
            state.generic.leftPath = normalized
          } else if (target === 'generic-right') {
            state.generic.rightPath = normalized
          } else {
            state.localized.rootPath = normalized
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
  const context = getPreviewContext()
  previewRequestToken += 1
  const currentToken = previewRequestToken

  if (!context) {
    state.preview = { left: null, right: null, loading: false }
    renderPreview()
    return
  }

  state.preview = { left: null, right: null, loading: true }
  renderPreview()

  try {
    const [left, right] = await Promise.all([
      context.leftPath ? loadPreview(context.leftPath) : Promise.resolve(null),
      context.rightPath ? loadPreview(context.rightPath) : Promise.resolve(null)
    ])

    if (currentToken !== previewRequestToken) {
      return
    }

    state.preview = { left, right, loading: false }
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
  renderMode()
  renderPaths()
  renderStatus()
  renderSummary()
  renderDropTargets()
  renderResults()
  renderPreview()
}

function renderMode(): void {
  modeTabsElement.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.mode === state.mode)
  })

  localizedInputsElement.classList.toggle('hidden', state.mode !== 'localized')
  genericInputsElement.classList.toggle('hidden', state.mode !== 'generic')
  localizedViewToggleElement.classList.toggle('hidden', state.mode !== 'localized')

  modeHelpElement.textContent =
    state.mode === 'localized'
      ? '请选择主目录 A，系统将自动扫描 Localize 子目录。'
      : '请选择两个不同的文件夹，逐项比对第一层同名图片。'

  syncFilterControls()
}

function renderPaths(): void {
  applyPath(rootPathElement, state.localized.rootPath)
  applyPath(leftPathElement, state.generic.leftPath)
  applyPath(rightPathElement, state.generic.rightPath)
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
    feedbackElement.textContent =
      state.mode === 'localized'
        ? '正在扫描 Localize 子目录并执行本地化比对，请稍候。'
        : '正在读取两个文件夹并比较同名图片尺寸，请稍候。'
    startCompareButton.disabled = true
    return
  }

  if (state.errorMessage) {
    feedbackElement.textContent = state.errorMessage
    startCompareButton.disabled = false
    return
  }

  const visibleCount = getVisibleItems().length
  if (state.viewState === 'done') {
    feedbackElement.textContent =
      visibleCount > 0 ? buildDoneMessage() : '暂无符合条件结果'
  } else {
    feedbackElement.textContent =
      state.mode === 'localized'
        ? '请选择主目录 A，系统将自动扫描 Localize 子目录。'
        : '请选择两个不同的文件夹后开始比对。'
  }

  startCompareButton.disabled = false
}

function buildDoneMessage(): string {
  if (state.mode === 'generic') {
    const issues = state.generic.results.filter((item) => item.status !== 'match').length
    return issues > 0 ? `发现 ${issues} 项异常，请在列表中查看。` : '全部同名图片尺寸一致。'
  }

  const source = getCurrentLocalizedSourceEntries()
  const issues = source.filter((item) => item.status !== 'match').length
  return issues > 0 ? `发现 ${issues} 条本地化异常，请在列表中查看。` : '当前本地化资源全部一致。'
}

function renderSummary(): void {
  if (state.mode === 'generic') {
    if (!state.generic.results.length) {
      summaryElement.textContent = '尚未开始比对'
      return
    }
    const total = state.generic.results.length
    const matched = state.generic.results.filter((item) => item.status === 'match').length
    summaryElement.textContent = `共 ${total} 项，${matched} 项一致，${total - matched} 项异常`
    return
  }

  if (!state.localized.entries.length) {
    summaryElement.textContent = '尚未开始比对'
    return
  }

  const localeCount = new Set(state.localized.entries.map((item) => item.locale)).size
  if (state.localized.view === 'expanded') {
    const total = state.localized.entries.length
    const matched = state.localized.entries.filter((item) => item.status === 'match').length
    summaryElement.textContent = `共 ${total} 条语言对比，${matched} 条一致，${total - matched} 条异常，${localeCount} 个语言目录`
  } else {
    const grouped = buildLocalizedGroupedResults(state.localized.entries)
    const matched = grouped.filter((item) => item.status === 'match').length
    summaryElement.textContent = `共 ${grouped.length} 个图片项，${matched} 项一致，${grouped.length - matched} 项异常，${localeCount} 个语言目录`
  }
}

function syncFilterControls(): void {
  const activeFilter = getActiveFilter()
  const wordpicOnly = getWordpicOnly()

  filtersElement.classList.toggle('is-disabled', getCurrentRawResultCount() === 0)
  filtersElement.querySelectorAll<HTMLButtonElement>('.filter-chip').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.filter === activeFilter)
  })
  localizedViewToggleElement.querySelectorAll<HTMLButtonElement>('.view-chip').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === state.localized.view)
  })
  wordpicOnlyElement.checked = wordpicOnly
}

function renderResults(): void {
  syncFilterControls()
  const visibleItems = getVisibleItems()
  const selectionChanged = ensureVisibleSelection(visibleItems)

  if (!getCurrentRawResultCount() || !visibleItems.length) {
    resultsElement.className = 'results-empty'
    resultsElement.innerHTML = '<p>暂无符合条件结果</p>'
    renderPagination(0)
    if (selectionChanged) void updatePreview()
    return
  }

  const totalPages = getVisibleTotalPages(visibleItems.length)
  if (getCurrentPage() > totalPages) {
    setCurrentPage(totalPages)
  }

  const start = (getCurrentPage() - 1) * PAGE_SIZE
  const pagedItems = visibleItems.slice(start, start + PAGE_SIZE)
  resultsElement.className = 'results-list'
  resultsElement.innerHTML = pagedItems.map(renderResultRow).join('')
  renderPagination(visibleItems.length)
  bindResultRowEvents()

  if (selectionChanged) {
    void updatePreview()
  }
}

function renderResultRow(item: GenericCompareResult | LocalizedCompareEntry | LocalizedGroupedResult): string {
  if (state.mode === 'generic') {
    const result = item as GenericCompareResult
    const selected = result.fileName === state.generic.selectedKey ? ' is-selected' : ''
    return `
      <button class="result-row status-${result.status}${selected}" type="button" data-kind="generic" data-key="${escapeAttribute(result.fileName)}">
        <div class="result-row__main">
          <strong>${escapeHtml(result.fileName)}</strong>
          <span>${escapeHtml(result.message)}</span>
        </div>
        <div class="result-row__sizes">
          <span>A：${formatSizeText(result.leftSize, result.leftPath, result.leftError)}</span>
          <span>B：${formatSizeText(result.rightSize, result.rightPath, result.rightError)}</span>
        </div>
        <div class="result-row__status">${statusLabel(result.status)}</div>
      </button>
    `
  }

  if (state.localized.view === 'expanded') {
    const entry = item as LocalizedCompareEntry
    const selected =
      localizedExpandedKey(entry) === state.localized.selectedExpandedKey ? ' is-selected' : ''
    return `
      <button class="result-row status-${entry.status}${selected}" type="button" data-kind="localized-expanded" data-key="${escapeAttribute(localizedExpandedKey(entry))}">
        <div class="result-row__main">
          <strong>${escapeHtml(entry.fileName)}</strong>
          <div class="result-row__meta">
            <span class="locale-tag">${escapeHtml(entry.locale)}</span>
            <span>${escapeHtml(entry.message)}</span>
          </div>
        </div>
        <div class="result-row__sizes">
          <span>主目录：${formatSizeText(entry.baseSize, entry.basePath, entry.baseError)}</span>
          <span>${escapeHtml(entry.locale)}：${formatSizeText(entry.localeSize, entry.localePath, entry.localeError)}</span>
        </div>
        <div class="result-row__status">${statusLabel(entry.status)}</div>
      </button>
    `
  }

  const group = item as LocalizedGroupedResult
  const selected = group.fileName === state.localized.selectedGroupedFile ? ' is-selected' : ''
  const localeChips = group.locales
    .slice(0, 4)
    .map((entry) => `<span class="locale-tag status-${entry.status}">${escapeHtml(entry.locale)}</span>`)
    .join('')
  const overflow =
    group.locales.length > 4 ? `<span class="locale-tag more">+${group.locales.length - 4}</span>` : ''

  return `
    <button class="result-row status-${group.status}${selected}" type="button" data-kind="localized-grouped" data-key="${escapeAttribute(group.fileName)}">
      <div class="result-row__main">
        <strong>${escapeHtml(group.fileName)}</strong>
        <span>${escapeHtml(group.message)}</span>
        <div class="locale-cluster">${localeChips}${overflow}</div>
      </div>
      <div class="result-row__sizes">
        <span>语言目录：${group.locales.length} 个</span>
        <span>异常：${group.locales.filter((entry) => entry.status !== 'match').length} 个</span>
      </div>
      <div class="result-row__status">${statusLabel(group.status)}</div>
    </button>
  `
}

function bindResultRowEvents(): void {
  resultsElement.querySelectorAll<HTMLButtonElement>('.result-row').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.dataset.key
      const kind = button.dataset.kind
      if (!key || !kind) {
        return
      }

      if (kind === 'generic') {
        if (key === state.generic.selectedKey) return
        state.generic.selectedKey = key
      } else if (kind === 'localized-expanded') {
        if (key === state.localized.selectedExpandedKey) return
        state.localized.selectedExpandedKey = key
      } else {
        if (key === state.localized.selectedGroupedFile) return
        state.localized.selectedGroupedFile = key
        state.localized.selectedGroupedLocale = pickGroupedLocaleForFile(key)
      }

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

  const totalPages = getVisibleTotalPages(totalItems)
  paginationElement.classList.remove('is-hidden')
  pageInfoElement.textContent = `共 ${totalItems} 条`
  pagePrevButton.disabled = getCurrentPage() <= 1
  pageNextButton.disabled = getCurrentPage() >= totalPages
  pageNumbersElement.innerHTML = buildPageButtons(totalPages)

  pageNumbersElement.querySelectorAll<HTMLButtonElement>('.pagination-page').forEach((button) => {
    button.addEventListener('click', () => {
      const page = Number(button.dataset.page)
      if (!page || page === getCurrentPage()) {
        return
      }
      setCurrentPage(page)
      renderResults()
      void updatePreview()
    })
  })
}

function buildPageButtons(totalPages: number): string {
  const pages = getPageWindow(totalPages, getCurrentPage())
  return pages
    .map((page) => {
      if (page === 'ellipsis') {
        return '<span class="pagination-ellipsis">…</span>'
      }
      const activeClass = page === getCurrentPage() ? ' is-active' : ''
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

function getCurrentPage(): number {
  if (state.mode === 'generic') {
    return state.generic.currentPage
  }
  return state.localized.view === 'expanded' ? state.localized.expandedPage : state.localized.groupedPage
}

function setCurrentPage(page: number): void {
  if (state.mode === 'generic') {
    state.generic.currentPage = page
  } else if (state.localized.view === 'expanded') {
    state.localized.expandedPage = page
  } else {
    state.localized.groupedPage = page
  }
}

function getActiveFilter(): FilterKey {
  return state.mode === 'generic' ? state.generic.activeFilter : state.localized.activeFilter
}

function setActiveFilter(filter: FilterKey): void {
  if (state.mode === 'generic') {
    state.generic.activeFilter = filter
  } else {
    state.localized.activeFilter = filter
  }
}

function getWordpicOnly(): boolean {
  return state.mode === 'generic' ? state.generic.wordpicOnly : state.localized.wordpicOnly
}

function setWordpicOnly(value: boolean): void {
  if (state.mode === 'generic') {
    state.generic.wordpicOnly = value
  } else {
    state.localized.wordpicOnly = value
  }
}

function getCurrentRawResultCount(): number {
  if (state.mode === 'generic') {
    return state.generic.results.length
  }
  return state.localized.view === 'expanded'
    ? state.localized.entries.length
    : buildLocalizedGroupedResults(state.localized.entries).length
}

function getVisibleItems(): Array<GenericCompareResult | LocalizedCompareEntry | LocalizedGroupedResult> {
  if (state.mode === 'generic') {
    return getVisibleGenericResults()
  }
  return state.localized.view === 'expanded'
    ? getVisibleLocalizedExpandedEntries()
    : getVisibleLocalizedGroupedResults()
}

function getVisibleGenericResults(): GenericCompareResult[] {
  let results = state.generic.results
  if (state.generic.wordpicOnly) {
    results = results.filter((item) => item.fileName.toLowerCase().includes('wordpic'))
  }
  switch (state.generic.activeFilter) {
    case 'all':
      return results
    case 'match':
      return results.filter((item) => item.status === 'match')
    case 'size_mismatch':
      return results.filter((item) => item.status === 'size_mismatch')
    case 'missing':
      return results.filter((item) => item.status === 'missing_left' || item.status === 'missing_right')
  }
}

function getVisibleLocalizedExpandedEntries(): LocalizedCompareEntry[] {
  let entries = state.localized.entries
  if (state.localized.wordpicOnly) {
    entries = entries.filter((item) => item.fileName.toLowerCase().includes('wordpic'))
  }
  switch (state.localized.activeFilter) {
    case 'all':
      return entries
    case 'match':
      return entries.filter((item) => item.status === 'match')
    case 'size_mismatch':
      return entries.filter((item) => item.status === 'size_mismatch')
    case 'missing':
      return entries.filter((item) => item.status === 'missing_left' || item.status === 'missing_right')
  }
}

function getVisibleLocalizedGroupedResults(): LocalizedGroupedResult[] {
  let groups = buildLocalizedGroupedResults(state.localized.entries)
  if (state.localized.wordpicOnly) {
    groups = groups.filter((item) => item.fileName.toLowerCase().includes('wordpic'))
  }
  switch (state.localized.activeFilter) {
    case 'all':
      return groups
    case 'match':
      return groups.filter((item) => item.status === 'match')
    case 'size_mismatch':
      return groups.filter((item) => item.status === 'size_mismatch')
    case 'missing':
      return groups.filter((item) => item.status === 'missing_left' || item.status === 'missing_right')
  }
}

function buildLocalizedGroupedResults(entries: LocalizedCompareEntry[]): LocalizedGroupedResult[] {
  const groups = new Map<string, LocalizedCompareEntry[]>()
  for (const entry of entries) {
    const bucket = groups.get(entry.fileName) ?? []
    bucket.push(entry)
    groups.set(entry.fileName, bucket)
  }

  return Array.from(groups.entries())
    .map(([fileName, locales]) => {
      const sortedLocales = [...locales].sort((left, right) => left.locale.localeCompare(right.locale))
      const missingCount = sortedLocales.filter(
        (item) => item.status === 'missing_left' || item.status === 'missing_right'
      ).length
      const mismatchCount = sortedLocales.filter((item) => item.status === 'size_mismatch').length
      const matchCount = sortedLocales.filter((item) => item.status === 'match').length

      let status: CompareStatus = 'match'
      if (missingCount > 0) {
        status = sortedLocales.find((item) => item.status === 'missing_left') ? 'missing_left' : 'missing_right'
      } else if (mismatchCount > 0) {
        status = 'size_mismatch'
      }

      const message =
        status === 'match'
          ? `${fileName} 在全部 ${sortedLocales.length} 个语言目录中尺寸一致`
          : `${fileName} 共 ${sortedLocales.length} 个语言目录，其中 ${matchCount} 个一致，${mismatchCount} 个尺寸异常，${missingCount} 个缺失`

      return { fileName, locales: sortedLocales, status, message }
    })
    .sort((left, right) => left.fileName.localeCompare(right.fileName))
}

function getVisibleTotalPages(totalItems = getVisibleItems().length): number {
  return Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
}

function ensureVisibleSelection(
  visibleItems: Array<GenericCompareResult | LocalizedCompareEntry | LocalizedGroupedResult>
): boolean {
  if (state.mode === 'generic') {
    const visibleKeys = new Set(visibleItems.map((item) => (item as GenericCompareResult).fileName))
    if (!state.generic.selectedKey || !visibleKeys.has(state.generic.selectedKey)) {
      state.generic.selectedKey = (visibleItems[0] as GenericCompareResult | undefined)?.fileName ?? null
      return true
    }
    return false
  }

  if (state.localized.view === 'expanded') {
    const visibleKeys = new Set(visibleItems.map((item) => localizedExpandedKey(item as LocalizedCompareEntry)))
    if (!state.localized.selectedExpandedKey || !visibleKeys.has(state.localized.selectedExpandedKey)) {
      const first = visibleItems[0] as LocalizedCompareEntry | undefined
      state.localized.selectedExpandedKey = first ? localizedExpandedKey(first) : null
      return true
    }
    return false
  }

  const visibleFiles = new Set(visibleItems.map((item) => (item as LocalizedGroupedResult).fileName))
  if (!state.localized.selectedGroupedFile || !visibleFiles.has(state.localized.selectedGroupedFile)) {
    const first = visibleItems[0] as LocalizedGroupedResult | undefined
    state.localized.selectedGroupedFile = first?.fileName ?? null
    state.localized.selectedGroupedLocale = first?.locales[0]?.locale ?? null
    return true
  }

  const selectedGroup = (visibleItems as LocalizedGroupedResult[]).find(
    (item) => item.fileName === state.localized.selectedGroupedFile
  )
  if (
    selectedGroup &&
    (!state.localized.selectedGroupedLocale ||
      !selectedGroup.locales.some((item) => item.locale === state.localized.selectedGroupedLocale))
  ) {
    state.localized.selectedGroupedLocale = selectedGroup.locales[0]?.locale ?? null
    return true
  }

  return false
}

function renderDropTargets(): void {
  folderCards.forEach((card) => {
    card.classList.toggle('is-drop-target', card.dataset.dropTarget === state.dropTarget)
  })
}

function getDropTarget(position: { x: number; y: number }): 'generic-left' | 'generic-right' | 'localized-root' | null {
  const element = document.elementFromPoint(position.x, position.y)
  const card = element?.closest<HTMLElement>('.folder-card')
  const target = card?.dataset.dropTarget
  if (
    target === 'generic-left' ||
    target === 'generic-right' ||
    target === 'localized-root'
  ) {
    return target
  }
  return null
}

function getPreviewContext(): PreviewContext | null {
  if (state.mode === 'generic') {
    const selected = state.generic.results.find((item) => item.fileName === state.generic.selectedKey)
    if (!selected) {
      return null
    }
    return {
      id: selected.fileName,
      leftLabel: '文件夹 A',
      rightLabel: '文件夹 B',
      leftPath: selected.leftPath,
      rightPath: selected.rightPath,
      leftSize: selected.leftSize,
      rightSize: selected.rightSize,
      leftError: selected.leftError,
      rightError: selected.rightError,
      message: selected.message,
      status: selected.status
    }
  }

  if (state.localized.view === 'expanded') {
    const selected = state.localized.entries.find(
      (item) => localizedExpandedKey(item) === state.localized.selectedExpandedKey
    )
    if (!selected) {
      return null
    }
    return {
      id: localizedExpandedKey(selected),
      leftLabel: '主目录 A',
      rightLabel: `语言目录 ${selected.locale}`,
      leftPath: selected.basePath,
      rightPath: selected.localePath,
      leftSize: selected.baseSize,
      rightSize: selected.localeSize,
      leftError: selected.baseError,
      rightError: selected.localeError,
      message: selected.message,
      status: selected.status
    }
  }

  const grouped = buildLocalizedGroupedResults(state.localized.entries).find(
    (item) => item.fileName === state.localized.selectedGroupedFile
  )
  if (!grouped) {
    return null
  }
  const selectedLocale =
    grouped.locales.find((item) => item.locale === state.localized.selectedGroupedLocale) ??
    grouped.locales[0]
  if (!selectedLocale) {
    return null
  }

  return {
    id: `${grouped.fileName}::${selectedLocale.locale}`,
    leftLabel: '主目录 A',
    rightLabel: `语言目录 ${selectedLocale.locale}`,
    leftPath: selectedLocale.basePath,
    rightPath: selectedLocale.localePath,
    leftSize: selectedLocale.baseSize,
    rightSize: selectedLocale.localeSize,
    leftError: selectedLocale.baseError,
    rightError: selectedLocale.localeError,
    message: grouped.message,
    status: grouped.status,
    localeOptions: grouped.locales.map((item) => item.locale),
    selectedLocale: selectedLocale.locale
  }
}

function renderPreview(): void {
  const context = getPreviewContext()
  if (!context) {
    previewTitleElement.textContent = '当前选中项'
    previewMetaElement.textContent = '请选择一条比对结果查看图片和尺寸详情。'
    previewMetaElement.className = 'preview-meta empty'
    previewLeftLabelElement.textContent = state.mode === 'localized' ? '主目录 A' : '文件夹 A'
    previewRightLabelElement.textContent = state.mode === 'localized' ? '当前语言目录' : '文件夹 B'
    leftDimensionElement.textContent = '未加载'
    rightDimensionElement.textContent = '未加载'
    previewLocaleSwitchElement.className = 'locale-switch is-hidden'
    previewLocaleSwitchElement.innerHTML = ''
    leftPreviewElement.className = 'preview-box empty'
    rightPreviewElement.className = 'preview-box empty'
    leftPreviewElement.textContent = '暂无预览'
    rightPreviewElement.textContent = '暂无预览'
    return
  }

  previewTitleElement.textContent =
    state.mode === 'localized' ? '主目录与本地化目录预览' : '当前选中项'
  previewLeftLabelElement.textContent = context.leftLabel
  previewRightLabelElement.textContent = context.rightLabel
  previewMetaElement.textContent = context.message
  previewMetaElement.className = `preview-meta tone-${context.status}`
  leftDimensionElement.textContent = formatSizeText(context.leftSize, context.leftPath, context.leftError)
  rightDimensionElement.textContent = formatSizeText(context.rightSize, context.rightPath, context.rightError)

  renderPreviewLocaleSwitch(context)

  if (state.preview.loading) {
    leftPreviewElement.className = 'preview-box loading'
    rightPreviewElement.className = 'preview-box loading'
    leftPreviewElement.textContent = '加载中...'
    rightPreviewElement.textContent = '加载中...'
    return
  }

  renderPreviewImage(leftPreviewElement, state.preview.left, context.leftPath, `${context.leftLabel} 预览`)
  renderPreviewImage(rightPreviewElement, state.preview.right, context.rightPath, `${context.rightLabel} 预览`)
}

function renderPreviewLocaleSwitch(context: PreviewContext): void {
  if (state.mode !== 'localized' || state.localized.view !== 'grouped' || !context.localeOptions?.length) {
    previewLocaleSwitchElement.className = 'locale-switch is-hidden'
    previewLocaleSwitchElement.innerHTML = ''
    return
  }

  previewLocaleSwitchElement.className = 'locale-switch'
  previewLocaleSwitchElement.innerHTML = context.localeOptions
    .map((locale) => {
      const activeClass = locale === context.selectedLocale ? ' is-active' : ''
      return `<button class="locale-switch__chip${activeClass}" type="button" data-locale="${escapeAttribute(locale)}">${escapeHtml(locale)}</button>`
    })
    .join('')

  previewLocaleSwitchElement.querySelectorAll<HTMLButtonElement>('.locale-switch__chip').forEach((button) => {
    button.addEventListener('click', () => {
      const locale = button.dataset.locale
      if (!locale || locale === state.localized.selectedGroupedLocale) {
        return
      }
      state.localized.selectedGroupedLocale = locale
      renderPreview()
      void updatePreview()
    })
  })
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

function pickGroupedLocaleForFile(fileName: string): string | null {
  const group = buildLocalizedGroupedResults(state.localized.entries).find((item) => item.fileName === fileName)
  if (!group) {
    return null
  }
  return group.locales.find((item) => item.status !== 'match')?.locale ?? group.locales[0]?.locale ?? null
}

function getCurrentLocalizedSourceEntries(): LocalizedCompareEntry[] {
  return state.localized.entries
}

function formatSizeText(size: ImageSize | null, path: string | null, error: string | null): string {
  if (size) {
    return `${size.width} × ${size.height}`
  }
  if (!path) {
    return '缺失'
  }
  if (error) {
    return '读取失败'
  }
  return '未知'
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
