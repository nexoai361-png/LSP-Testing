import './index.css';
import { CodeEditorManager } from './editor';
import { AVAILABLE_THEMES, INITIAL_FILES, SUPPORTED_LANGUAGES } from './sampleCodes';
import { CursorPosition, EditorSettings, FileTab, LanguageOption, ThemeOption } from './types';
import { IndexedDBStorage } from './db';

class CodeEditorApp {
  private editorManager: CodeEditorManager;
  private editorManagerSplit: CodeEditorManager | null = null;
  private isSplit: boolean = false;
  private activePane: 0 | 1 = 0;
  private activeTabIdSplit: string = INITIAL_FILES[0].id;
  private isSyncingContent: boolean = false;

  private db: IndexedDBStorage = new IndexedDBStorage();
  private tabs: FileTab[] = [...INITIAL_FILES];
  private activeTabId: string = INITIAL_FILES[0].id;
  private settings: EditorSettings = {
    theme: 'ace/theme/vscode_dark',
    fontSize: 14,
    tabSize: 2,
    useSoftTabs: true,
    wordWrap: true,
    showLineNumbers: true,
    showGutter: true,
    highlightActiveLine: true,
  };
  private cursorStats: CursorPosition = { row: 1, column: 1, totalLines: 1, selectedTextLength: 0 };
  private activeModal: string | null = null;

  constructor() {
    this.editorManager = new CodeEditorManager();
  }

  private saveState(): void {
    this.db.saveTabs(this.tabs).catch((err) => console.error('Failed to save tabs:', err));
    this.db.saveActiveTabId(this.activeTabId).catch((err) => console.error('Failed to save active tab ID:', err));
  }

  private saveSettings(): void {
    this.db.saveSettings(this.settings).catch((err) => console.error('Failed to save settings:', err));
    this.editorManager.updateSettings(this.settings);
    if (this.editorManagerSplit) {
      this.editorManagerSplit.updateSettings(this.settings);
    }
  }

  public async init(): Promise<void> {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    // Initialize IndexedDB and load persisted state if present
    try {
      await this.db.init();
      const storedTabs = await this.db.loadTabs();
      const storedActiveTabId = await this.db.loadActiveTabId();
      const storedSettings = await this.db.loadSettings();

      if (storedTabs && storedTabs.length > 0) {
        this.tabs = storedTabs;
      }
      if (storedActiveTabId && this.tabs.some((t) => t.id === storedActiveTabId)) {
        this.activeTabId = storedActiveTabId;
      } else if (this.tabs.length > 0) {
        this.activeTabId = this.tabs[0].id;
      }
      if (storedSettings) {
        this.settings = storedSettings;
      }
    } catch (err) {
      console.error('[IndexedDB] Initialization or load failed, using default state:', err);
    }

    // Render App Layout
    appEl.innerHTML = this.renderLayout();

    // Attach Event Listeners
    this.attachEventListeners();

    // Initialize Ace Editor inside container
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
      const activeFile = this.getActiveTab();
      this.editorManager.init(
        editorContainer,
        this.settings,
        activeFile.content,
        activeFile.language,
        (pos) => this.onCursorChange(pos, 0),
        (content) => this.onContentChange(content, 0),
        () => {
          if (this.isSplit && this.activePane !== 0) {
            this.activePane = 0;
            this.updateFocusVisuals();
          }
        }
      );
    }

    // Auto resize editor on window resize / orientation change
    window.addEventListener('resize', () => {
      this.editorManager.resize();
      if (this.editorManagerSplit) {
        this.editorManagerSplit.resize();
      }
    });

    // Global Keyboard Shortcuts (F1, Ctrl+Shift+P, Cmd+Shift+P, Alt+Shift+F)
    window.addEventListener('keydown', (e) => {
      if (
        e.key === 'F1' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p'))
      ) {
        e.preventDefault();
        this.getActiveEditorManager().openAceCommandPalette();
      } else if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        this.getActiveEditorManager().formatCurrentFile();
      }
    });
  }

  private getActiveTab(): FileTab {
    const currentActiveTabId = this.isSplit && this.activePane === 1 ? this.activeTabIdSplit : this.activeTabId;
    return this.tabs.find((t) => t.id === currentActiveTabId) || this.tabs[0];
  }

  private renderLayout(): string {
    const activeTab = this.getActiveTab();
    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === activeTab.language) || SUPPORTED_LANGUAGES[0];

    return `
      <!-- TOP NAVIGATION BAR (VS Code Style - Compact) -->
      <header class="bg-[#252526] border-b border-[#3C3C3C] flex flex-col shrink-0 select-none">
        <!-- Main Header Bar -->
        <div class="h-10 px-2 flex items-center justify-between gap-1.5 bg-[#1E1E1E] border-b border-[#2D2D2D]">
          <!-- App Branding & File Name -->
          <div class="flex items-center gap-1.5 overflow-hidden pl-1">
            <div class="flex flex-col truncate leading-tight">
              <span class="text-[9px] text-[#858585] font-semibold uppercase tracking-wider">Mobile Code Editor</span>
              <span class="text-xs font-bold text-white truncate" id="header-filename">${this.escapeHtml(activeTab.name)}</span>
            </div>
          </div>

          <!-- Top Toolbar Action Buttons (Compact Buttons, Pure White FA Icons) -->
          <div class="flex items-center gap-1 shrink-0">
            <!-- Language Selector Badge -->
            <button id="btn-language" class="h-7 px-2 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-[10px] text-white border border-[#3C3C3C] flex items-center gap-1 font-mono uppercase transition-colors" title="Change Language">
              <span>${currentLang.extension.toUpperCase()}</span>
              <i class="fa-solid fa-chevron-down text-white text-[9px]"></i>
            </button>

            <!-- Command Palette Button -->
            <button id="btn-cmd-palette" class="w-7 h-7 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-white border border-[#3C3C3C] flex items-center justify-center transition-colors" title="Command Palette (F1 / Ctrl+Shift+P)">
              <i class="fa-solid fa-terminal text-white text-xs"></i>
            </button>

            <!-- Search Button -->
            <button id="btn-search" class="w-7 h-7 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-white border border-[#3C3C3C] flex items-center justify-center transition-colors" title="Find in file">
              <i class="fa-solid fa-magnifying-glass text-white text-xs"></i>
            </button>

            <!-- Go to Line Button -->
            <button id="btn-goto" class="w-7 h-7 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-white border border-[#3C3C3C] flex items-center justify-center transition-colors" title="Go to line">
              <i class="fa-solid fa-list-ol text-white text-xs"></i>
            </button>

            <!-- Run / Preview Code -->
            <button id="btn-preview" class="w-7 h-7 bg-[#0E639C] hover:bg-[#1177BB] active:bg-[#005999] text-white border border-[#0E639C] flex items-center justify-center transition-colors" title="Run / Preview Output">
              <i class="fa-solid fa-play text-white text-xs"></i>
            </button>

            <!-- Split Editor Button -->
            <button id="btn-split" class="w-7 h-7 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-white border border-[#3C3C3C] flex items-center justify-center transition-colors" title="Split Editor (Horizontal)">
              <i class="fa-solid fa-columns rotate-90 text-white text-xs"></i>
            </button>

            <!-- Settings Drawer Button -->
            <button id="btn-settings" class="w-7 h-7 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-white border border-[#3C3C3C] flex items-center justify-center transition-colors" title="Settings">
              <i class="fa-solid fa-gear text-white text-xs"></i>
            </button>

            <!-- More Overflow Actions Button -->
            <button id="btn-more" class="w-7 h-7 bg-[#2D2D2D] hover:bg-[#3D3D3D] active:bg-[#0E639C] text-white border border-[#3C3C3C] flex items-center justify-center transition-colors" title="More Actions">
              <i class="fa-solid fa-ellipsis-vertical text-white text-xs"></i>
            </button>
          </div>
        </div>

        <!-- File Tabs Bar (Compact) -->
        <div class="flex items-center bg-[#252526] overflow-x-auto scrollbar-none border-t border-[#1E1E1E]" id="tabs-container">
          ${this.renderTabsHtml()}
          <!-- Add Tab Button -->
          <button id="btn-add-tab" class="px-2.5 h-7 text-white hover:bg-[#2D2D2D] flex items-center justify-center shrink-0 transition-colors border-r border-[#3C3C3C]" title="New File">
            <i class="fa-solid fa-plus text-white text-xs"></i>
          </button>
        </div>
      </header>

      <!-- EDITOR MAIN CONTAINER AREA (Supports Horizontal splitting on mobile) -->
      <main class="flex-1 relative bg-[#1E1E1E] overflow-hidden flex flex-col" id="editor-layout-main">
        <div id="editor-container-parent" class="flex-1 relative border-transparent">
          <div id="editor-container" class="absolute inset-0 w-full h-full"></div>
          <!-- Focused Indicator Bar (Visible in Split Mode) -->
          <div id="editor-focus-bar-1" class="absolute top-0 left-0 right-0 h-0.5 bg-[#0E639C] z-30 opacity-0 transition-opacity duration-150"></div>
        </div>
        <div id="editor-container-parent-split" class="flex-1 relative border-t border-[#3C3C3C] hidden">
          <div id="editor-container-split" class="absolute inset-0 w-full h-full"></div>
          <!-- Focused Indicator Bar (Visible in Split Mode) -->
          <div id="editor-focus-bar-2" class="absolute top-0 left-0 right-0 h-0.5 bg-[#0E639C] z-30 opacity-0 transition-opacity duration-150"></div>
        </div>
      </main>

      <!-- STATUS BAR (VS Code Blue Style at bottom - Compact) -->
      <footer class="h-5 bg-[#007ACC] text-white px-2 flex items-center justify-between text-[10px] font-mono shrink-0 select-none z-20">
        <!-- Left status: Cursor position -->
        <div class="flex items-center gap-2">
          <span id="status-cursor">Ln 1, Col 1</span>
          <span id="status-selection" class="hidden sm:inline"></span>
          <span id="status-lines" class="text-blue-200">1 lines</span>
          <span id="status-lsp" class="ml-2 px-1 rounded bg-[#444444] text-gray-300 text-[9px] font-bold" title="Language server is offline. (Supported for HTML & CSS)">LSP: Offline</span>
        </div>

        <!-- Right status: Indentation, Encoding, Language -->
        <div class="flex items-center gap-2">
          <span id="status-indent">Spaces: ${this.settings.tabSize}</span>
          <span id="status-encoding" class="hidden sm:inline">UTF-8</span>
          <span id="status-language" class="font-bold uppercase">${currentLang.name}</span>
        </div>
      </footer>

      <!-- MODAL OVERLAYS CONTAINER -->
      <div id="modal-container" class="hidden fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-3"></div>
    `;
  }

  private renderTabsHtml(): string {
    const currentActiveTabId = this.isSplit && this.activePane === 1 ? this.activeTabIdSplit : this.activeTabId;
    return this.tabs
      .map((tab) => {
        const isActive = tab.id === currentActiveTabId;
        return `
          <div class="vscode-tab ${isActive ? 'active' : ''} h-7 px-2.5 flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0 group border-r border-[#181818]" data-tab-id="${tab.id}">
            <span class="font-mono text-[11px]">${this.escapeHtml(tab.name)}</span>
            ${
              this.tabs.length > 1
                ? `<button class="btn-close-tab opacity-70 hover:opacity-100 p-0.5 hover:bg-[#444444] text-white" data-tab-close="${tab.id}" title="Close file">
                    <i class="fa-solid fa-xmark text-white text-[10px]"></i>
                   </button>`
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  private attachEventListeners(): void {
    // Tab switching & close events
    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Close button click
        const closeBtn = target.closest('[data-tab-close]') as HTMLElement;
        if (closeBtn) {
          e.stopPropagation();
          const tabId = closeBtn.getAttribute('data-tab-close');
          if (tabId) this.closeTab(tabId);
          return;
        }

        // Tab click
        const tabEl = target.closest('[data-tab-id]') as HTMLElement;
        if (tabEl) {
          const tabId = tabEl.getAttribute('data-tab-id');
          if (tabId) this.switchTab(tabId);
        }
      });
    }

    // Add Tab
    document.getElementById('btn-add-tab')?.addEventListener('click', () => {
      this.addNewTab();
    });

    // Command Palette Button
    document.getElementById('btn-cmd-palette')?.addEventListener('click', () => {
      this.getActiveEditorManager().openAceCommandPalette();
    });

    // Language Picker Button
    document.getElementById('btn-language')?.addEventListener('click', () => {
      this.openLanguageModal();
    });

    // Search Button
    document.getElementById('btn-search')?.addEventListener('click', () => {
      this.getActiveEditorManager().openSearch();
    });

    // Go To Line Button
    document.getElementById('btn-goto')?.addEventListener('click', () => {
      this.openGoToLineModal();
    });

    // Run / Preview Code
    document.getElementById('btn-preview')?.addEventListener('click', () => {
      this.openPreviewModal();
    });

    // Split Editor Button
    document.getElementById('btn-split')?.addEventListener('click', () => {
      this.toggleSplit();
    });

    // Settings Button
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      this.openSettingsModal();
    });

    // More Actions Button
    document.getElementById('btn-more')?.addEventListener('click', () => {
      this.openMoreActionsModal();
    });

    // Quick Keys Bar (Insert character at cursor)
    document.getElementById('quick-keys-bar')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.keypad-btn') as HTMLElement;
      if (!btn) return;

      const charToInsert = btn.getAttribute('data-key');
      const action = btn.getAttribute('data-action');

      if (charToInsert) {
        this.getActiveEditorManager().insertText(charToInsert);
      } else if (action === 'tab') {
        this.getActiveEditorManager().indent();
      } else if (action === 'comment') {
        this.getActiveEditorManager().toggleComment();
      }
    });

    // Utility buttons
    document.getElementById('key-undo')?.addEventListener('click', () => this.getActiveEditorManager().undo());
    document.getElementById('key-redo')?.addEventListener('click', () => this.getActiveEditorManager().redo());
    document.getElementById('key-indent')?.addEventListener('click', () => this.getActiveEditorManager().indent());
    document.getElementById('key-outdent')?.addEventListener('click', () => this.getActiveEditorManager().outdent());
    document.getElementById('key-dup')?.addEventListener('click', () => this.getActiveEditorManager().duplicateLine());
    document.getElementById('key-format')?.addEventListener('click', () => this.getActiveEditorManager().formatCurrentFile());
    document.getElementById('key-copy')?.addEventListener('click', () => this.copyCurrentCode());
  }

  private switchTab(tabId: string): void {
    if (this.isSplit && this.activePane === 1) {
      if (tabId === this.activeTabIdSplit) return;

      // Save currently active split tab content
      const currentTabSplit = this.tabs.find(t => t.id === this.activeTabIdSplit);
      if (currentTabSplit && this.editorManagerSplit) {
        currentTabSplit.content = this.editorManagerSplit.getContent();
      }

      this.activeTabIdSplit = tabId;
      const newActiveTabSplit = this.tabs.find(t => t.id === tabId) || this.tabs[0];

      // Update Editor split content & mode
      if (this.editorManagerSplit) {
        this.editorManagerSplit.setContent(newActiveTabSplit.content, newActiveTabSplit.language);
      }
    } else {
      if (tabId === this.activeTabId) return;

      // Save currently active primary tab content
      const currentTab = this.tabs.find(t => t.id === this.activeTabId);
      if (currentTab) {
        currentTab.content = this.editorManager.getContent();
      }

      this.activeTabId = tabId;
      const newActiveTab = this.getActiveTab();

      // Update Editor primary content & mode
      this.editorManager.setContent(newActiveTab.content, newActiveTab.language);
    }

    // Common UI updates
    const currentActiveTabId = this.isSplit && this.activePane === 1 ? this.activeTabIdSplit : this.activeTabId;
    const activeFile = this.tabs.find(t => t.id === currentActiveTabId) || this.tabs[0];

    const filenameEl = document.getElementById('header-filename');
    if (filenameEl) filenameEl.textContent = activeFile.name;

    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === activeFile.language) || SUPPORTED_LANGUAGES[0];
    const langBtn = document.getElementById('btn-language');
    if (langBtn) {
      langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
    }

    const langStatus = document.getElementById('status-language');
    if (langStatus) langStatus.textContent = currentLang.name;

    // Re-render Tabs Bar
    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
      const addBtn = document.getElementById('btn-add-tab');
      tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
      document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
    }

    this.saveState();
  }

  private closeTab(tabId: string): void {
    if (this.tabs.length <= 1) return; // Keep at least 1 tab open

    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    this.tabs.splice(index, 1);

    // If closed tab was active in pane 0
    if (tabId === this.activeTabId) {
      this.activeTabId = this.tabs[Math.max(0, index - 1)].id;
    }
    // If closed tab was active in pane 1
    if (tabId === this.activeTabIdSplit) {
      this.activeTabIdSplit = this.tabs[Math.max(0, index - 1)].id;
    }

    // Refresh contents
    const primaryActiveTab = this.tabs.find(t => t.id === this.activeTabId) || this.tabs[0];
    this.editorManager.setContent(primaryActiveTab.content, primaryActiveTab.language);

    if (this.isSplit && this.editorManagerSplit) {
      const splitActiveTab = this.tabs.find(t => t.id === this.activeTabIdSplit) || this.tabs[0];
      this.editorManagerSplit.setContent(splitActiveTab.content, splitActiveTab.language);
    }

    // Update headers and active tab
    const currentActiveTabId = this.isSplit && this.activePane === 1 ? this.activeTabIdSplit : this.activeTabId;
    const activeFile = this.tabs.find(t => t.id === currentActiveTabId) || this.tabs[0];

    const filenameEl = document.getElementById('header-filename');
    if (filenameEl) filenameEl.textContent = activeFile.name;

    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === activeFile.language) || SUPPORTED_LANGUAGES[0];
    const langBtn = document.getElementById('btn-language');
    if (langBtn) {
      langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
    }

    const langStatus = document.getElementById('status-language');
    if (langStatus) langStatus.textContent = currentLang.name;

    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
      const addBtn = document.getElementById('btn-add-tab');
      tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
      document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
    }
    this.saveState();
  }

  private addNewTab(): void {
    const newId = 'tab-' + Date.now();
    const count = this.tabs.length + 1;
    const newTab: FileTab = {
      id: newId,
      name: `untitled-${count}.ts`,
      language: 'ace/mode/typescript',
      content: `// New File\nconsole.log("Hello from Mobile Code Editor");\n`,
    };

    this.tabs.push(newTab);
    this.switchTab(newId);
  }

  private onCursorChange(pos: CursorPosition, pane?: number): void {
    if (pane !== undefined && pane !== this.activePane) return;

    this.cursorStats = pos;
    const cursorEl = document.getElementById('status-cursor');
    if (cursorEl) {
      cursorEl.textContent = `Ln ${pos.row}, Col ${pos.column}`;
    }

    const linesEl = document.getElementById('status-lines');
    if (linesEl) {
      linesEl.textContent = `${pos.totalLines} lines`;
    }

    const selEl = document.getElementById('status-selection');
    if (selEl) {
      if (pos.selectedTextLength > 0) {
        selEl.textContent = `(${pos.selectedTextLength} sel)`;
        selEl.classList.remove('hidden');
      } else {
        selEl.classList.add('hidden');
      }
    }
  }

  private onContentChange(content: string, pane: number): void {
    if (this.isSyncingContent) return;

    const currentTabId = pane === 1 ? this.activeTabIdSplit : this.activeTabId;
    const activeTab = this.tabs.find(t => t.id === currentTabId);

    if (activeTab) {
      activeTab.content = content;
      this.db.saveTabs(this.tabs).catch((err) => console.error('Failed to save tabs:', err));

      // If split editor is open and both are editing the same file, sync!
      if (this.isSplit && this.activeTabId === this.activeTabIdSplit) {
        this.isSyncingContent = true;
        try {
          if (pane === 0 && this.editorManagerSplit) {
            this.editorManagerSplit.setContent(content, activeTab.language);
          } else if (pane === 1) {
            this.editorManager.setContent(content, activeTab.language);
          }
        } finally {
          this.isSyncingContent = false;
        }
      }
    }
  }

  private copyCurrentCode(): void {
    const content = this.getActiveEditorManager().getContent();
    navigator.clipboard
      .writeText(content)
      .then(() => {
        this.showToast('Copied code to clipboard');
      })
      .catch(() => {
        this.showToast('Failed to copy');
      });
  }

  // --- MODALS IMPLEMENTATION ---

  private openModal(contentHtml: string): void {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = contentHtml;
    container.classList.remove('hidden');

    // Close on backdrop click
    container.onclick = (e) => {
      if (e.target === container) {
        this.closeModal();
      }
    };

    // Close button click
    container.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', () => this.closeModal());
    });
  }

  private closeModal(): void {
    const container = document.getElementById('modal-container');
    if (!container) return;
    container.classList.add('hidden');
    container.innerHTML = '';
    this.editorManager.focus();
  }

  private openLanguageModal(): void {
    const activeTab = this.getActiveTab();
    
    const renderItems = (searchQuery: string = ''): string => {
      const query = searchQuery.toLowerCase().trim();
      const filtered = SUPPORTED_LANGUAGES.filter(lang => 
        lang.name.toLowerCase().includes(query) || 
        lang.extension.toLowerCase().includes(query)
      );

      if (filtered.length === 0) {
        return `<div class="p-3 text-xs text-[#858585] text-center italic font-mono bg-[#1E1E1E]">No matching languages found</div>`;
      }

      return filtered.map((lang, index) => {
        const isSelected = lang.aceMode === activeTab.language;
        const isActive = index === 0; 
        return `
          <div class="quick-pick-item flex items-center justify-between w-full h-8 px-3 text-left text-xs font-mono text-[#CCCCCC] cursor-pointer select-none border-l-2 ${
            isSelected ? 'border-l-[#0E639C] bg-[#222222]' : 'border-l-transparent'
          } ${isActive ? 'active' : ''}" data-mode="${lang.aceMode}">
            <div class="flex items-center gap-2">
              <span class="w-3 text-center flex items-center justify-center">${isSelected ? '<i class="fa-solid fa-check text-[#0E639C] text-[10px]"></i>' : ''}</span>
              <span class="text-[#CCCCCC]">${lang.name}</span>
            </div>
            <span class="quick-pick-ext text-[#858585] text-[10px]">${lang.extension}</span>
          </div>
        `;
      }).join('');
    };

    const html = `
      <div class="absolute top-[50px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-[#252526] border border-[#3C3C3C] shadow-2xl flex flex-col z-50">
        <!-- Input section -->
        <div class="p-1.5 border-b border-[#3C3C3C] bg-[#252526]">
          <input type="text" id="quick-pick-search" class="w-full bg-[#1E1E1E] text-white border border-[#3C3C3C] focus:border-[#0E639C] focus:outline-none text-[11px] px-2.5 py-1.5 font-mono" placeholder="Select Language Mode" autofocus autocomplete="off" />
        </div>
        <!-- List Section -->
        <div class="flex flex-col max-h-60 overflow-y-auto bg-[#1E1E1E]" id="quick-pick-list">
          ${renderItems()}
        </div>
      </div>
    `;

    this.openModal(html);

    const searchInput = document.getElementById('quick-pick-search') as HTMLInputElement;
    const listContainer = document.getElementById('quick-pick-list') as HTMLDivElement;

    if (searchInput) {
      searchInput.focus();
      
      searchInput.addEventListener('input', () => {
        listContainer.innerHTML = renderItems(searchInput.value);
        attachItemListeners();
      });

      searchInput.addEventListener('keydown', (e) => {
        const items = Array.from(listContainer.querySelectorAll('.quick-pick-item')) as HTMLElement[];
        if (items.length === 0) return;

        let activeIdx = items.findIndex(item => item.classList.contains('active'));

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (activeIdx !== -1) items[activeIdx].classList.remove('active');
          activeIdx = (activeIdx + 1) % items.length;
          items[activeIdx].classList.add('active');
          items[activeIdx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (activeIdx !== -1) items[activeIdx].classList.remove('active');
          activeIdx = (activeIdx - 1 + items.length) % items.length;
          items[activeIdx].classList.add('active');
          items[activeIdx].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const currentActive = listContainer.querySelector('.quick-pick-item.active') as HTMLElement;
          if (currentActive) {
            currentActive.click();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeModal();
        }
      });
    }

    const selectMode = (mode: string) => {
      activeTab.language = mode;
      this.getActiveEditorManager().setMode(mode);

      const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === mode);
      if (currentLang) {
        const langBtn = document.getElementById('btn-language');
        if (langBtn) langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
        const langStatus = document.getElementById('status-language');
        if (langStatus) langStatus.textContent = currentLang.name;
      }
      this.closeModal();
    };

    const attachItemListeners = () => {
      listContainer.querySelectorAll('.quick-pick-item').forEach((item) => {
        item.addEventListener('mouseenter', (e) => {
          listContainer.querySelectorAll('.quick-pick-item').forEach(i => i.classList.remove('active'));
          (e.currentTarget as HTMLElement).classList.add('active');
        });

        item.addEventListener('click', (e) => {
          const mode = (e.currentTarget as HTMLElement).getAttribute('data-mode');
          if (mode) selectMode(mode);
        });
      });
    };

    attachItemListeners();
  }

  private openGoToLineModal(): void {
    const html = `
      <div class="bg-[#1E1E1E] border border-[#3C3C3C] w-full max-w-xs p-3 flex flex-col gap-2.5">
        <div class="flex items-center justify-between border-b border-[#3C3C3C] pb-2">
          <h3 class="text-xs font-bold text-white font-ui">Go to Line</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-[11px] text-[#CCCCCC]">Enter line number (1 - ${this.cursorStats.totalLines}):</label>
          <input type="number" id="input-gotoline" min="1" max="${this.cursorStats.totalLines}" value="${this.cursorStats.row}" class="vscode-input h-7 px-2 text-xs text-white w-full" autofocus />
          <button id="btn-submit-gotoline" class="vscode-btn-primary h-7 w-full mt-1 text-xs">Jump to Line</button>
        </div>
      </div>
    `;

    this.openModal(html);

    const input = document.getElementById('input-gotoline') as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }

    const submit = () => {
      const lineNum = parseInt(input.value, 10);
      if (!isNaN(lineNum) && lineNum >= 1) {
        this.editorManager.gotoLine(lineNum);
        this.closeModal();
      }
    };

    document.getElementById('btn-submit-gotoline')?.addEventListener('click', submit);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  private openSettingsModal(): void {
    const html = `
      <div class="bg-[#1E1E1E] border border-[#3C3C3C] w-full max-w-sm p-3 flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-[#3C3C3C] pb-2">
          <h3 class="text-xs font-bold text-white font-ui uppercase tracking-wider">Editor Settings</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>

        <!-- Theme Selection -->
        <div class="flex flex-col gap-1">
          <label class="text-[11px] text-[#858585] font-bold uppercase">Editor Theme</label>
          <div class="grid grid-cols-2 gap-1">
            ${AVAILABLE_THEMES.map((theme) => {
              const isSelected = theme.aceTheme === this.settings.theme;
              return `
                <button class="btn-theme-option h-7 px-2 text-[11px] font-mono text-left border ${
                  isSelected ? 'border-[#0E639C] bg-[#0E639C]/30 text-white font-bold' : 'border-[#3C3C3C] bg-[#2D2D2D] text-[#CCCCCC]'
                }" data-theme="${theme.aceTheme}">
                  ${theme.name}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Font Size -->
        <div class="flex items-center justify-between border-t border-[#3C3C3C] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Font Size (${this.settings.fontSize}px)</span>
          <div class="flex items-center gap-1">
            <button id="btn-font-dec" class="vscode-btn w-6 h-6 p-0 flex items-center justify-center font-bold text-xs">-</button>
            <span class="font-mono text-[11px] w-5 text-center text-white">${this.settings.fontSize}</span>
            <button id="btn-font-inc" class="vscode-btn w-6 h-6 p-0 flex items-center justify-center font-bold text-xs">+</button>
          </div>
        </div>

        <!-- Tab Size -->
        <div class="flex items-center justify-between border-t border-[#3C3C3C] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Tab Indent Size</span>
          <div class="flex items-center gap-1">
            <button class="btn-tabsize vscode-btn h-6 px-2 text-[11px] ${this.settings.tabSize === 2 ? 'bg-[#0E639C] text-white' : ''}" data-size="2">2</button>
            <button class="btn-tabsize vscode-btn h-6 px-2 text-[11px] ${this.settings.tabSize === 4 ? 'bg-[#0E639C] text-white' : ''}" data-size="4">4</button>
          </div>
        </div>

        <!-- Word Wrap Toggle -->
        <div class="flex items-center justify-between border-t border-[#3C3C3C] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Soft Word Wrap</span>
          <input type="checkbox" id="chk-wordwrap" ${this.settings.wordWrap ? 'checked' : ''} class="w-4 h-4 accent-[#0E639C]" />
        </div>

        <!-- Line Numbers Toggle -->
        <div class="flex items-center justify-between border-t border-[#3C3C3C] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Show Line Numbers</span>
          <input type="checkbox" id="chk-linenumbers" ${this.settings.showLineNumbers ? 'checked' : ''} class="w-4 h-4 accent-[#0E639C]" />
        </div>

        <!-- Active Line Highlight Toggle -->
        <div class="flex items-center justify-between border-t border-[#3C3C3C] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Highlight Active Line</span>
          <input type="checkbox" id="chk-activeline" ${this.settings.highlightActiveLine ? 'checked' : ''} class="w-4 h-4 accent-[#0E639C]" />
        </div>
      </div>
    `;

    this.openModal(html);

    // Theme selector click
    document.querySelectorAll('.btn-theme-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const theme = (e.currentTarget as HTMLElement).getAttribute('data-theme');
        if (theme) {
          this.settings.theme = theme;
          this.editorManager.setTheme(theme);
          if (this.editorManagerSplit) {
            this.editorManagerSplit.setTheme(theme);
          }
          this.saveSettings();
          this.closeModal();
        }
      });
    });

    // Font Size Adjusters
    document.getElementById('btn-font-dec')?.addEventListener('click', () => {
      if (this.settings.fontSize > 10) {
        this.settings.fontSize--;
        this.saveSettings();
        this.openSettingsModal();
      }
    });

    document.getElementById('btn-font-inc')?.addEventListener('click', () => {
      if (this.settings.fontSize < 28) {
        this.settings.fontSize++;
        this.saveSettings();
        this.openSettingsModal();
      }
    });

    // Tab Size Adjusters
    document.querySelectorAll('.btn-tabsize').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const size = parseInt((e.currentTarget as HTMLElement).getAttribute('data-size') || '2', 10);
        this.settings.tabSize = size;
        this.saveSettings();

        const indentStatus = document.getElementById('status-indent');
        if (indentStatus) indentStatus.textContent = `Spaces: ${size}`;
        this.openSettingsModal();
      });
    });

    // Checkboxes
    document.getElementById('chk-wordwrap')?.addEventListener('change', (e) => {
      this.settings.wordWrap = (e.target as HTMLInputElement).checked;
      this.saveSettings();
    });

    document.getElementById('chk-linenumbers')?.addEventListener('change', (e) => {
      this.settings.showLineNumbers = (e.target as HTMLInputElement).checked;
      this.settings.showGutter = (e.target as HTMLInputElement).checked;
      this.saveSettings();
    });

    document.getElementById('chk-activeline')?.addEventListener('change', (e) => {
      this.settings.highlightActiveLine = (e.target as HTMLInputElement).checked;
      this.saveSettings();
    });
  }

  private openMoreActionsModal(): void {
    const activeTab = this.getActiveTab();
    const html = `
      <div class="bg-[#1E1E1E] border border-[#3C3C3C] w-full max-w-xs p-3 flex flex-col gap-1.5 shadow-2xl">
        <div class="flex items-center justify-between border-b border-[#3C3C3C] pb-2 mb-1">
          <h3 class="text-xs font-bold text-white font-ui uppercase tracking-wider">Quick Actions</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>

        <button id="act-cmd-palette" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between bg-[#0E639C]/20 border-[#0E639C]/50">
          <span class="text-white font-bold">Command Palette (F1)</span>
          <i class="fa-solid fa-terminal text-white text-xs"></i>
        </button>

        <button id="act-rename" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between">
          <span class="text-white">Rename File (${this.escapeHtml(activeTab.name)})</span>
          <i class="fa-solid fa-pen-to-square text-white text-xs"></i>
        </button>

        <button id="act-clear" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between">
          <span class="text-white">Clear Editor Content</span>
          <i class="fa-solid fa-trash-can text-white text-xs"></i>
        </button>

        <button id="act-download" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between">
          <span class="text-white">Save / Download File</span>
          <i class="fa-solid fa-download text-white text-xs"></i>
        </button>

        <button id="act-stats" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between">
          <span class="text-white">File Statistics</span>
          <i class="fa-solid fa-chart-simple text-white text-xs"></i>
        </button>

        <button id="act-reset" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between border-red-900/50 text-red-200">
          <span>Reset Demo Files</span>
          <i class="fa-solid fa-arrows-rotate text-white text-xs"></i>
        </button>
      </div>
    `;

    this.openModal(html);

    document.getElementById('act-cmd-palette')?.addEventListener('click', () => {
      this.closeModal();
      this.getActiveEditorManager().openAceCommandPalette();
    });

    document.getElementById('act-rename')?.addEventListener('click', () => {
      const newName = prompt('Enter new file name:', activeTab.name);
      if (newName && newName.trim()) {
        activeTab.name = newName.trim();
        const filenameEl = document.getElementById('header-filename');
        if (filenameEl) filenameEl.textContent = activeTab.name;

        // Re-render tabs
        const tabsContainer = document.getElementById('tabs-container');
        if (tabsContainer) {
          const addBtn = document.getElementById('btn-add-tab');
          tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
          document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
        }
        this.saveState();
      }
      this.closeModal();
    });

    document.getElementById('act-clear')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all code in this file?')) {
        this.getActiveEditorManager().setContent('');
      }
      this.closeModal();
    });

    document.getElementById('act-download')?.addEventListener('click', () => {
      const content = this.getActiveEditorManager().getContent();
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = activeTab.name;
      a.click();
      URL.revokeObjectURL(url);
      this.closeModal();
    });

    document.getElementById('act-stats')?.addEventListener('click', () => {
      this.closeModal();
      this.openStatsModal();
    });

    document.getElementById('act-reset')?.addEventListener('click', () => {
      if (confirm('Reset all files back to initial samples?')) {
        this.tabs = [...INITIAL_FILES];
        this.switchTab(INITIAL_FILES[0].id);
      }
      this.closeModal();
    });
  }

  private openStatsModal(): void {
    const content = this.getActiveEditorManager().getContent();
    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lineCount = content.split('\n').length;
    const byteSize = new Blob([content]).size;

    const html = `
      <div class="bg-[#1E1E1E] border border-[#3C3C3C] w-full max-w-xs p-3 flex flex-col gap-2.5">
        <div class="flex items-center justify-between border-b border-[#3C3C3C] pb-2">
          <h3 class="text-xs font-bold text-white font-ui uppercase tracking-wider">File Statistics</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>

        <div class="flex flex-col gap-1.5 font-mono text-[11px] text-[#CCCCCC]">
          <div class="flex justify-between py-1 border-b border-[#2D2D2D]">
            <span class="text-[#858585]">File Name:</span>
            <span class="text-white font-bold">${this.escapeHtml(this.getActiveTab().name)}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-[#2D2D2D]">
            <span class="text-[#858585]">Total Lines:</span>
            <span class="text-white">${lineCount}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-[#2D2D2D]">
            <span class="text-[#858585]">Characters:</span>
            <span class="text-white">${charCount}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-[#2D2D2D]">
            <span class="text-[#858585]">Words:</span>
            <span class="text-white">${wordCount}</span>
          </div>
          <div class="flex justify-between py-1">
            <span class="text-[#858585]">Size:</span>
            <span class="text-white">${byteSize} bytes</span>
          </div>
        </div>
      </div>
    `;

    this.openModal(html);
  }

  private openPreviewModal(): void {
    const content = this.getActiveEditorManager().getContent();
    const activeTab = this.getActiveTab();

    let iframeSrc = '';
    if (activeTab.language === 'ace/mode/html') {
      iframeSrc = content;
    } else if (activeTab.language === 'ace/mode/javascript' || activeTab.language === 'ace/mode/typescript') {
      iframeSrc = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { background: #121212; color: #00FF66; font-family: monospace; padding: 12px; margin: 0; }
            .log { border-bottom: 1px solid #222; padding: 4px 0; }
            .err { color: #FF5555; }
          </style>
        </head>
        <body>
          <div id="console"></div>
          <script>
            const consoleDiv = document.getElementById('console');
            function log(msg, isErr) {
              const div = document.createElement('div');
              div.className = 'log ' + (isErr ? 'err' : '');
              div.textContent = '> ' + (typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg);
              consoleDiv.appendChild(div);
            }
            console.log = log;
            console.error = (e) => log(e, true);
            try {
              ${content}
            } catch (err) {
              console.error(err.message || err);
            }
          </script>
        </body>
        </html>
      `;
    } else {
      iframeSrc = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>body { background: #121212; color: #CCCCCC; font-family: sans-serif; padding: 20px; }</style>
        </head>
        <body>
          <h3>Preview not supported for mode: ${activeTab.language}</h3>
          <p>HTML and JavaScript / TypeScript code can be executed directly in preview mode.</p>
        </body>
        </html>
      `;
    }

    const html = `
      <div class="bg-[#1E1E1E] border border-[#3C3C3C] w-full h-[85vh] max-w-2xl flex flex-col shadow-2xl">
        <div class="h-8 px-2.5 bg-[#252526] border-b border-[#3C3C3C] flex items-center justify-between shrink-0">
          <span class="text-xs font-bold text-white font-ui uppercase tracking-wider">Preview / Execution Output</span>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>
        <div class="flex-1 w-full h-full bg-white relative">
          <iframe id="preview-iframe" class="w-full h-full border-none" sandbox="allow-scripts"></iframe>
        </div>
      </div>
    `;

    this.openModal(html);

    const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
    if (iframe) {
      iframe.srcdoc = iframeSrc;
    }
  }

  private toggleWordWrap(): void {
    this.settings.wordWrap = !this.settings.wordWrap;
    this.editorManager.updateSettings(this.settings);
    this.saveSettings();
  }

  private toggleLineNumbers(): void {
    this.settings.showLineNumbers = !this.settings.showLineNumbers;
    this.settings.showGutter = this.settings.showLineNumbers;
    this.editorManager.updateSettings(this.settings);
    this.saveSettings();
  }

  private changeFontSize(delta: number): void {
    const newSize = this.settings.fontSize + delta;
    if (newSize >= 10 && newSize <= 30) {
      this.settings.fontSize = newSize;
      this.editorManager.updateSettings(this.settings);
      this.saveSettings();
    }
  }

  private clearCurrentFile(): void {
    if (confirm('Are you sure you want to clear all content in the current file?')) {
      this.editorManager.setContent('');
    }
  }

  private downloadCurrentFile(): void {
    const activeTab = this.getActiveTab();
    const content = this.editorManager.getContent();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeTab.name;
    a.click();
  }

  private openRenameModal(): void {
    const activeTab = this.getActiveTab();
    const newName = prompt('Enter new file name:', activeTab.name);
    if (newName && newName.trim()) {
      activeTab.name = newName.trim();
      const filenameEl = document.getElementById('header-filename');
      if (filenameEl) filenameEl.textContent = activeTab.name;

      const tabsContainer = document.getElementById('tabs-container');
      if (tabsContainer) {
        const addBtn = document.getElementById('btn-add-tab');
        tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
        document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
      }
      this.saveState();
    }
  }

  private resetDefaultFiles(): void {
    if (confirm('Reset all files to default sample code? This will discard unsaved changes.')) {
      this.tabs = INITIAL_FILES.map((f) => ({ ...f }));
      this.activeTabId = this.tabs[0].id;
      this.editorManager.setContent(this.tabs[0].content, this.tabs[0].language);

      const filenameEl = document.getElementById('header-filename');
      if (filenameEl) filenameEl.textContent = this.tabs[0].name;

      const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === this.tabs[0].language) || SUPPORTED_LANGUAGES[0];
      const langBtn = document.getElementById('btn-language');
      if (langBtn) {
        langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
      }
      const langStatus = document.getElementById('status-language');
      if (langStatus) langStatus.textContent = currentLang.name;

      const tabsContainer = document.getElementById('tabs-container');
      if (tabsContainer) {
        const addBtn = document.getElementById('btn-add-tab');
        tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
        document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
      }
      this.saveState();
    }
  }

  private getActiveEditorManager(): CodeEditorManager {
    return this.isSplit && this.activePane === 1 && this.editorManagerSplit
      ? this.editorManagerSplit
      : this.editorManager;
  }

  private updateFocusVisuals(): void {
    const bar1 = document.getElementById('editor-focus-bar-1');
    const bar2 = document.getElementById('editor-focus-bar-2');

    if (this.isSplit) {
      if (this.activePane === 0) {
        if (bar1) bar1.classList.remove('opacity-0');
        if (bar2) bar2.classList.add('opacity-0');
      } else {
        if (bar1) bar1.classList.add('opacity-0');
        if (bar2) bar2.classList.remove('opacity-0');
      }
    } else {
      if (bar1) bar1.classList.add('opacity-0');
      if (bar2) bar2.classList.add('opacity-0');
    }

    // Refresh headers tab bar (highlight active tab on focused pane)
    const currentActiveTabId = this.isSplit && this.activePane === 1 ? this.activeTabIdSplit : this.activeTabId;
    const activeFile = this.tabs.find(t => t.id === currentActiveTabId) || this.tabs[0];

    const filenameEl = document.getElementById('header-filename');
    if (filenameEl) filenameEl.textContent = activeFile.name;

    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === activeFile.language) || SUPPORTED_LANGUAGES[0];
    const langBtn = document.getElementById('btn-language');
    if (langBtn) {
      langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
    }

    const langStatus = document.getElementById('status-language');
    if (langStatus) langStatus.textContent = currentLang.name;

    const tabsContainer = document.getElementById('tabs-container');
    if (tabsContainer) {
      const addBtn = document.getElementById('btn-add-tab');
      tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
      document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
    }

    // Update status bar stats from the active editor's cursor position
    const activeManager = this.getActiveEditorManager();
    const activeInstance = activeManager.getEditorInstance();
    if (activeInstance) {
      const pos = activeInstance.getCursorPosition();
      const totalLines = activeInstance.getSession().getLength();
      const selectedText = activeInstance.getSelectedText();
      this.onCursorChange({
        row: pos.row + 1,
        column: pos.column + 1,
        totalLines,
        selectedTextLength: selectedText ? selectedText.length : 0
      }, this.activePane);
    }
  }

  private toggleSplit(): void {
    const parent1 = document.getElementById('editor-container-parent');
    const parent2 = document.getElementById('editor-container-parent-split');
    const splitBtn = document.getElementById('btn-split');

    if (!parent1 || !parent2) return;

    if (this.isSplit) {
      // Close split editor
      this.isSplit = false;
      this.activePane = 0;
      parent2.classList.add('hidden');
      parent1.classList.remove('border-b', 'border-[#3C3C3C]');

      if (splitBtn) {
        splitBtn.classList.remove('bg-[#0E639C]', 'border-[#0E639C]');
        splitBtn.classList.add('bg-[#2D2D2D]', 'border-[#3C3C3C]');
        splitBtn.title = "Split Editor (Horizontal)";
        const icon = splitBtn.querySelector('i');
        if (icon) {
          icon.className = "fa-solid fa-columns rotate-90 text-white text-xs";
        }
      }

      if (this.editorManagerSplit) {
        const instance = this.editorManagerSplit.getEditorInstance();
        if (instance) instance.destroy();
        this.editorManagerSplit = null;
      }

      // Update indicators
      this.updateFocusVisuals();

      // Update primary active tab
      const newActiveTab = this.getActiveTab();
      const filenameEl = document.getElementById('header-filename');
      if (filenameEl) filenameEl.textContent = newActiveTab.name;

      const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === newActiveTab.language) || SUPPORTED_LANGUAGES[0];
      const langBtn = document.getElementById('btn-language');
      if (langBtn) {
        langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
      }

      const langStatus = document.getElementById('status-language');
      if (langStatus) langStatus.textContent = currentLang.name;

      // Re-render tabs
      const tabsContainer = document.getElementById('tabs-container');
      if (tabsContainer) {
        const addBtn = document.getElementById('btn-add-tab');
        tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
        document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
      }

      this.editorManager.resize();
    } else {
      // Open split editor
      this.isSplit = true;
      this.activePane = 1; // Focus the split pane immediately
      this.activeTabIdSplit = this.activeTabId; // Initially display same file

      parent1.classList.add('border-b', 'border-[#3C3C3C]');
      parent2.classList.remove('hidden');

      if (splitBtn) {
        splitBtn.classList.add('bg-[#0E639C]', 'border-[#0E639C]');
        splitBtn.classList.remove('bg-[#2D2D2D]', 'border-[#3C3C3C]');
        splitBtn.title = "Close Split Editor";
        const icon = splitBtn.querySelector('i');
        if (icon) {
          icon.className = "fa-solid fa-rectangle-xmark text-white text-xs";
        }
      }

      // Initialize secondary EditorManager
      this.editorManagerSplit = new CodeEditorManager();
      const editorSplitContainer = document.getElementById('editor-container-split');
      const activeFile = this.tabs.find(t => t.id === this.activeTabIdSplit) || this.tabs[0];

      if (editorSplitContainer) {
        this.editorManagerSplit.init(
          editorSplitContainer,
          this.settings,
          activeFile.content,
          activeFile.language,
          (pos) => this.onCursorChange(pos, 1),
          (content) => this.onContentChange(content, 1),
          () => {
            if (this.isSplit && this.activePane !== 1) {
              this.activePane = 1;
              this.updateFocusVisuals();
            }
          }
        );
      }

      // Update focus bars
      this.updateFocusVisuals();

      // Setup click listeners on containers to handle split switching
      const el1 = document.getElementById('editor-container');
      const el2 = document.getElementById('editor-container-split');

      const focusPane0 = () => {
        if (this.activePane !== 0) {
          this.activePane = 0;
          this.updateFocusVisuals();
        }
      };

      const focusPane1 = () => {
        if (this.activePane !== 1) {
          this.activePane = 1;
          this.updateFocusVisuals();
        }
      };

      if (el1) {
        el1.addEventListener('mousedown', focusPane0, true);
        el1.addEventListener('touchstart', focusPane0, { passive: true });
      }
      if (el2) {
        el2.addEventListener('mousedown', focusPane1, true);
        el2.addEventListener('touchstart', focusPane1, { passive: true });
      }

      // Focus split editor
      this.editorManagerSplit.focus();

      // Trigger resize for both editors
      setTimeout(() => {
        this.editorManager.resize();
        if (this.editorManagerSplit) this.editorManagerSplit.resize();
      }, 50);
    }
  }

  private showToast(msg: string): void {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 bg-[#007ACC] text-white px-4 py-2 text-xs font-mono shadow-lg border border-blue-400 z-50 pointer-events-none transition-opacity duration-300';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Start Application reliably
function startApp() {
  const app = new CodeEditorApp();
  app.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
