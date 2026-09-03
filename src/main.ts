import './index.css';
import { CodeEditorManager } from './editor';
import { AVAILABLE_THEMES, INITIAL_FILES, SUPPORTED_LANGUAGES } from './sampleCodes';
import { CursorPosition, EditorSettings, FileTab, LanguageOption, ThemeOption } from './types';
import { IndexedDBStorage } from './db';

class CodeEditorApp {
  private editorManager: CodeEditorManager;
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
        (pos) => this.onCursorChange(pos),
        (content) => this.onContentChange(content)
      );
    }

    // Auto resize editor on window resize / orientation change
    window.addEventListener('resize', () => {
      this.editorManager.resize();
    });

    // Global Keyboard Shortcuts (F1, Ctrl+Shift+P, Cmd+Shift+P, Alt+Shift+F)
    window.addEventListener('keydown', (e) => {
      if (
        e.key === 'F1' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p'))
      ) {
        e.preventDefault();
        this.editorManager.openAceCommandPalette();
      } else if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        this.editorManager.formatCurrentFile();
      }
    });
  }

  private getActiveTab(): FileTab {
    return this.tabs.find((t) => t.id === this.activeTabId) || this.tabs[0];
  }

  private renderLayout(): string {
    const activeTab = this.getActiveTab();
    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === activeTab.language) || SUPPORTED_LANGUAGES[0];

    return `
      <!-- TOP NAVIGATION BAR (VS Code Style - Compact) -->
      <header class="bg-[#181818] border-b border-[#333333] flex flex-col shrink-0 select-none">
        <!-- Main Header Bar -->
        <div class="h-10 px-2 flex items-center justify-between gap-1.5 bg-[#121212] border-b border-[#2A2A2A]">
          <!-- App Branding & File Name -->
          <div class="flex items-center gap-1.5 overflow-hidden">
            <div class="w-6 h-6 bg-[#007ACC] flex items-center justify-center text-white shrink-0 font-bold text-[10px]">
              <i class="fa-solid fa-code text-white text-xs"></i>
            </div>
            <div class="flex flex-col truncate leading-tight">
              <span class="text-[9px] text-[#858585] font-semibold uppercase tracking-wider">Mobile Code Editor</span>
              <span class="text-xs font-bold text-white truncate" id="header-filename">${this.escapeHtml(activeTab.name)}</span>
            </div>
          </div>

          <!-- Top Toolbar Action Buttons (Compact Buttons, Pure White FA Icons) -->
          <div class="flex items-center gap-1 shrink-0">
            <!-- Language Selector Badge -->
            <button id="btn-language" class="h-7 px-2 bg-[#252526] hover:bg-[#333333] active:bg-[#007ACC] text-[10px] text-white border border-[#333333] flex items-center gap-1 font-mono uppercase transition-colors" title="Change Language">
              <span>${currentLang.extension.toUpperCase()}</span>
              <i class="fa-solid fa-chevron-down text-white text-[9px]"></i>
            </button>

            <!-- Command Palette Button -->
            <button id="btn-cmd-palette" class="w-7 h-7 bg-[#252526] hover:bg-[#333333] active:bg-[#007ACC] text-white border border-[#333333] flex items-center justify-center transition-colors" title="Command Palette (F1 / Ctrl+Shift+P)">
              <i class="fa-solid fa-terminal text-white text-xs"></i>
            </button>

            <!-- Search Button -->
            <button id="btn-search" class="w-7 h-7 bg-[#252526] hover:bg-[#333333] active:bg-[#007ACC] text-white border border-[#333333] flex items-center justify-center transition-colors" title="Find in file">
              <i class="fa-solid fa-magnifying-glass text-white text-xs"></i>
            </button>

            <!-- Go to Line Button -->
            <button id="btn-goto" class="w-7 h-7 bg-[#252526] hover:bg-[#333333] active:bg-[#007ACC] text-white border border-[#333333] flex items-center justify-center transition-colors" title="Go to line">
              <i class="fa-solid fa-list-ol text-white text-xs"></i>
            </button>

            <!-- Run / Preview Code -->
            <button id="btn-preview" class="w-7 h-7 bg-[#007ACC] active:bg-[#005999] text-white border border-[#007ACC] flex items-center justify-center transition-colors" title="Run / Preview Output">
              <i class="fa-solid fa-play text-white text-xs"></i>
            </button>

            <!-- Settings Drawer Button -->
            <button id="btn-settings" class="w-7 h-7 bg-[#252526] hover:bg-[#333333] active:bg-[#007ACC] text-white border border-[#333333] flex items-center justify-center transition-colors" title="Settings">
              <i class="fa-solid fa-gear text-white text-xs"></i>
            </button>

            <!-- More Overflow Actions Button -->
            <button id="btn-more" class="w-7 h-7 bg-[#252526] hover:bg-[#333333] active:bg-[#007ACC] text-white border border-[#333333] flex items-center justify-center transition-colors" title="More Actions">
              <i class="fa-solid fa-ellipsis-vertical text-white text-xs"></i>
            </button>
          </div>
        </div>

        <!-- File Tabs Bar (Compact) -->
        <div class="flex items-center bg-[#252526] overflow-x-auto scrollbar-none border-t border-[#181818]" id="tabs-container">
          ${this.renderTabsHtml()}
          <!-- Add Tab Button -->
          <button id="btn-add-tab" class="px-2.5 h-7 text-white hover:bg-[#333333] flex items-center justify-center shrink-0 transition-colors border-r border-[#333333]" title="New File">
            <i class="fa-solid fa-plus text-white text-xs"></i>
          </button>
        </div>
      </header>

      <!-- EDITOR MAIN CONTAINER AREA -->
      <main class="flex-1 relative bg-[#1E1E1E] overflow-hidden">
        <div id="editor-container" class="absolute inset-0 w-full h-full"></div>
      </main>

      <!-- MOBILE QUICK CODING ACCESSORY KEYPAD (Compact) -->
      <div class="bg-[#121212] border-t border-[#333333] flex flex-col shrink-0 z-10">
        <!-- Keypad Quick Toolbar -->
        <div class="px-1.5 py-1 bg-[#181818] border-b border-[#2A2A2A] flex items-center gap-1 overflow-x-auto scrollbar-none" id="quick-keys-bar">
          <button class="keypad-btn" data-key="{">{</button>
          <button class="keypad-btn" data-key="}">}</button>
          <button class="keypad-btn" data-key="[">[</button>
          <button class="keypad-btn" data-key="]">]</button>
          <button class="keypad-btn" data-key="(">(</button>
          <button class="keypad-btn" data-key=")">)</button>
          <button class="keypad-btn" data-key="<">&lt;</button>
          <button class="keypad-btn" data-key=">">&gt;</button>
          <button class="keypad-btn" data-key="=">=</button>
          <button class="keypad-btn" data-key=";">;</button>
          <button class="keypad-btn" data-key=":">:</button>
          <button class="keypad-btn" data-key="&quot;">"</button>
          <button class="keypad-btn" data-key="'">'</button>
          <button class="keypad-btn" data-key="+">+</button>
          <button class="keypad-btn" data-key="-">-</button>
          <button class="keypad-btn" data-key="*">*</button>
          <button class="keypad-btn" data-key="/">/</button>
          <button class="keypad-btn" data-key="$">$</button>
          <button class="keypad-btn" data-key="_">_</button>
          <button class="keypad-btn" data-key="|">|</button>
          <button class="keypad-btn" data-key="&amp;">&amp;</button>
          <button class="keypad-btn" data-key="!">!</button>
          <button class="keypad-btn" data-key="?">?</button>
          <button class="keypad-btn" data-action="tab" title="Indent Tab"><i class="fa-solid fa-indent text-white text-[10px]"></i></button>
          <button class="keypad-btn" data-action="comment" title="Toggle Comment"><i class="fa-solid fa-hashtag text-white text-[10px]"></i></button>
        </div>

        <!-- Quick Code Utility Buttons (Small Buttons) -->
        <div class="h-7 px-1.5 bg-[#000000] flex items-center justify-between text-[10px] text-[#858585] overflow-x-auto gap-1">
          <div class="flex items-center gap-1">
            <button id="key-undo" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]" title="Undo">
              <i class="fa-solid fa-rotate-left text-white text-[9px]"></i>
              <span>Undo</span>
            </button>
            <button id="key-redo" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]" title="Redo">
              <i class="fa-solid fa-rotate-right text-white text-[9px]"></i>
              <span>Redo</span>
            </button>
            <button id="key-indent" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]">
              <i class="fa-solid fa-indent text-white text-[9px]"></i>
              <span>Indent</span>
            </button>
            <button id="key-outdent" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]">
              <i class="fa-solid fa-outdent text-white text-[9px]"></i>
              <span>Outdent</span>
            </button>
            <button id="key-dup" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]">
              <i class="fa-solid fa-clone text-white text-[9px]"></i>
              <span>Dup</span>
            </button>
            <button id="key-format" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]" title="Format Document (Alt+Shift+F)">
              <i class="fa-solid fa-wand-magic-sparkles text-white text-[9px]"></i>
              <span>Format</span>
            </button>
          </div>

          <div class="flex items-center gap-1">
            <button id="key-copy" class="px-1.5 h-5 bg-[#1E1E1E] hover:bg-[#2A2A2A] active:bg-[#007ACC] text-white border border-[#333333] flex items-center gap-1 font-sans text-[10px]" title="Copy All">
              <i class="fa-solid fa-copy text-white text-[9px]"></i>
              <span>Copy</span>
            </button>
          </div>
        </div>
      </div>

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
    return this.tabs
      .map((tab) => {
        const isActive = tab.id === this.activeTabId;
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
      this.editorManager.openAceCommandPalette();
    });

    // Language Picker Button
    document.getElementById('btn-language')?.addEventListener('click', () => {
      this.openLanguageModal();
    });

    // Search Button
    document.getElementById('btn-search')?.addEventListener('click', () => {
      this.editorManager.openSearch();
    });

    // Go To Line Button
    document.getElementById('btn-goto')?.addEventListener('click', () => {
      this.openGoToLineModal();
    });

    // Run / Preview Code
    document.getElementById('btn-preview')?.addEventListener('click', () => {
      this.openPreviewModal();
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
        this.editorManager.insertText(charToInsert);
      } else if (action === 'tab') {
        this.editorManager.indent();
      } else if (action === 'comment') {
        this.editorManager.toggleComment();
      }
    });

    // Utility buttons
    document.getElementById('key-undo')?.addEventListener('click', () => this.editorManager.undo());
    document.getElementById('key-redo')?.addEventListener('click', () => this.editorManager.redo());
    document.getElementById('key-indent')?.addEventListener('click', () => this.editorManager.indent());
    document.getElementById('key-outdent')?.addEventListener('click', () => this.editorManager.outdent());
    document.getElementById('key-dup')?.addEventListener('click', () => this.editorManager.duplicateLine());
    document.getElementById('key-format')?.addEventListener('click', () => this.editorManager.formatCurrentFile());
    document.getElementById('key-copy')?.addEventListener('click', () => this.copyCurrentCode());
  }

  private switchTab(tabId: string): void {
    if (tabId === this.activeTabId) return;

    // Save active tab content first
    const currentTab = this.getActiveTab();
    if (currentTab) {
      currentTab.content = this.editorManager.getContent();
    }

    this.activeTabId = tabId;
    const newActiveTab = this.getActiveTab();

    // Update Editor content & language mode
    this.editorManager.setContent(newActiveTab.content, newActiveTab.language);

    // Update UI headers & status
    const filenameEl = document.getElementById('header-filename');
    if (filenameEl) filenameEl.textContent = newActiveTab.name;

    const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === newActiveTab.language) || SUPPORTED_LANGUAGES[0];
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
      // Re-bind add tab button if needed
      document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
    }

    this.saveState();
  }

  private closeTab(tabId: string): void {
    if (this.tabs.length <= 1) return; // Keep at least 1 tab open

    const index = this.tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    this.tabs.splice(index, 1);

    if (tabId === this.activeTabId) {
      const newActive = this.tabs[Math.max(0, index - 1)];
      this.switchTab(newActive.id);
    } else {
      const tabsContainer = document.getElementById('tabs-container');
      if (tabsContainer) {
        const addBtn = document.getElementById('btn-add-tab');
        tabsContainer.innerHTML = this.renderTabsHtml() + (addBtn ? addBtn.outerHTML : '');
        document.getElementById('btn-add-tab')?.addEventListener('click', () => this.addNewTab());
      }
      this.saveState();
    }
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

  private onCursorChange(pos: CursorPosition): void {
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

  private onContentChange(content: string): void {
    const activeTab = this.getActiveTab();
    if (activeTab) {
      activeTab.content = content;
      this.db.saveTabs(this.tabs).catch((err) => console.error('Failed to save tabs:', err));
    }
  }

  private copyCurrentCode(): void {
    const content = this.editorManager.getContent();
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
    const html = `
      <div class="bg-[#1E1E1E] border border-[#333333] w-full max-w-sm p-3 flex flex-col gap-2.5 shadow-2xl">
        <div class="flex items-center justify-between border-b border-[#333333] pb-2">
          <h3 class="text-xs font-bold text-white font-ui uppercase tracking-wider">Select Language Mode</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>

        <div class="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto pr-1">
          ${SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = lang.aceMode === activeTab.language;
            return `
              <button class="btn-select-lang w-full h-8 px-2.5 bg-[#252526] hover:bg-[#333333] ${
                isSelected ? 'border-l-2 border-l-[#007ACC] bg-[#2A2A2A]' : ''
              } text-left text-[11px] font-mono text-white flex items-center justify-between transition-colors" data-mode="${
              lang.aceMode
            }">
                <span>${lang.name}</span>
                <span class="text-blue-300 text-[10px]">${lang.extension}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.openModal(html);

    document.querySelectorAll('.btn-select-lang').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const mode = (e.currentTarget as HTMLElement).getAttribute('data-mode');
        if (mode) {
          activeTab.language = mode;
          this.editorManager.setMode(mode);

          const currentLang = SUPPORTED_LANGUAGES.find((l) => l.aceMode === mode);
          if (currentLang) {
            const langBtn = document.getElementById('btn-language');
            if (langBtn) langBtn.querySelector('span')!.textContent = currentLang.extension.toUpperCase();
            const langStatus = document.getElementById('status-language');
            if (langStatus) langStatus.textContent = currentLang.name;
          }
          this.closeModal();
        }
      });
    });
  }

  private openGoToLineModal(): void {
    const html = `
      <div class="bg-[#1E1E1E] border border-[#333333] w-full max-w-xs p-3 flex flex-col gap-2.5">
        <div class="flex items-center justify-between border-b border-[#333333] pb-2">
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
      <div class="bg-[#1E1E1E] border border-[#333333] w-full max-w-sm p-3 flex flex-col gap-3 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-[#333333] pb-2">
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
                  isSelected ? 'border-[#007ACC] bg-[#007ACC]/30 text-white font-bold' : 'border-[#333333] bg-[#252526] text-[#CCCCCC]'
                }" data-theme="${theme.aceTheme}">
                  ${theme.name}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Font Size -->
        <div class="flex items-center justify-between border-t border-[#333333] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Font Size (${this.settings.fontSize}px)</span>
          <div class="flex items-center gap-1">
            <button id="btn-font-dec" class="vscode-btn w-6 h-6 p-0 flex items-center justify-center font-bold text-xs">-</button>
            <span class="font-mono text-[11px] w-5 text-center text-white">${this.settings.fontSize}</span>
            <button id="btn-font-inc" class="vscode-btn w-6 h-6 p-0 flex items-center justify-center font-bold text-xs">+</button>
          </div>
        </div>

        <!-- Tab Size -->
        <div class="flex items-center justify-between border-t border-[#333333] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Tab Indent Size</span>
          <div class="flex items-center gap-1">
            <button class="btn-tabsize vscode-btn h-6 px-2 text-[11px] ${this.settings.tabSize === 2 ? 'bg-[#007ACC] text-white' : ''}" data-size="2">2</button>
            <button class="btn-tabsize vscode-btn h-6 px-2 text-[11px] ${this.settings.tabSize === 4 ? 'bg-[#007ACC] text-white' : ''}" data-size="4">4</button>
          </div>
        </div>

        <!-- Word Wrap Toggle -->
        <div class="flex items-center justify-between border-t border-[#333333] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Soft Word Wrap</span>
          <input type="checkbox" id="chk-wordwrap" ${this.settings.wordWrap ? 'checked' : ''} class="w-4 h-4 accent-[#007ACC]" />
        </div>

        <!-- Line Numbers Toggle -->
        <div class="flex items-center justify-between border-t border-[#333333] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Show Line Numbers</span>
          <input type="checkbox" id="chk-linenumbers" ${this.settings.showLineNumbers ? 'checked' : ''} class="w-4 h-4 accent-[#007ACC]" />
        </div>

        <!-- Active Line Highlight Toggle -->
        <div class="flex items-center justify-between border-t border-[#333333] pt-2">
          <span class="text-[11px] text-[#CCCCCC]">Highlight Active Line</span>
          <input type="checkbox" id="chk-activeline" ${this.settings.highlightActiveLine ? 'checked' : ''} class="w-4 h-4 accent-[#007ACC]" />
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
          this.saveSettings();
          this.closeModal();
        }
      });
    });

    // Font Size Adjusters
    document.getElementById('btn-font-dec')?.addEventListener('click', () => {
      if (this.settings.fontSize > 10) {
        this.settings.fontSize--;
        this.editorManager.updateSettings(this.settings);
        this.saveSettings();
        this.openSettingsModal();
      }
    });

    document.getElementById('btn-font-inc')?.addEventListener('click', () => {
      if (this.settings.fontSize < 28) {
        this.settings.fontSize++;
        this.editorManager.updateSettings(this.settings);
        this.saveSettings();
        this.openSettingsModal();
      }
    });

    // Tab Size Adjusters
    document.querySelectorAll('.btn-tabsize').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const size = parseInt((e.currentTarget as HTMLElement).getAttribute('data-size') || '2', 10);
        this.settings.tabSize = size;
        this.editorManager.updateSettings(this.settings);
        this.saveSettings();

        const indentStatus = document.getElementById('status-indent');
        if (indentStatus) indentStatus.textContent = `Spaces: ${size}`;
        this.openSettingsModal();
      });
    });

    // Checkboxes
    document.getElementById('chk-wordwrap')?.addEventListener('change', (e) => {
      this.settings.wordWrap = (e.target as HTMLInputElement).checked;
      this.editorManager.updateSettings(this.settings);
      this.saveSettings();
    });

    document.getElementById('chk-linenumbers')?.addEventListener('change', (e) => {
      this.settings.showLineNumbers = (e.target as HTMLInputElement).checked;
      this.settings.showGutter = (e.target as HTMLInputElement).checked;
      this.editorManager.updateSettings(this.settings);
      this.saveSettings();
    });

    document.getElementById('chk-activeline')?.addEventListener('change', (e) => {
      this.settings.highlightActiveLine = (e.target as HTMLInputElement).checked;
      this.editorManager.updateSettings(this.settings);
      this.saveSettings();
    });
  }

  private openMoreActionsModal(): void {
    const activeTab = this.getActiveTab();
    const html = `
      <div class="bg-[#1E1E1E] border border-[#333333] w-full max-w-xs p-3 flex flex-col gap-1.5 shadow-2xl">
        <div class="flex items-center justify-between border-b border-[#333333] pb-2 mb-1">
          <h3 class="text-xs font-bold text-white font-ui uppercase tracking-wider">Quick Actions</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>

        <button id="act-cmd-palette" class="vscode-btn h-8 px-2.5 text-[11px] text-left flex items-center justify-between bg-[#007ACC]/20 border-[#007ACC]/50">
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
      this.editorManager.openAceCommandPalette();
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
        this.editorManager.setContent('');
      }
      this.closeModal();
    });

    document.getElementById('act-download')?.addEventListener('click', () => {
      const content = this.editorManager.getContent();
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
    const content = this.editorManager.getContent();
    const charCount = content.length;
    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lineCount = content.split('\n').length;
    const byteSize = new Blob([content]).size;

    const html = `
      <div class="bg-[#1E1E1E] border border-[#333333] w-full max-w-xs p-3 flex flex-col gap-2.5">
        <div class="flex items-center justify-between border-b border-[#333333] pb-2">
          <h3 class="text-xs font-bold text-white font-ui uppercase tracking-wider">File Statistics</h3>
          <button data-close-modal class="text-white hover:opacity-80 p-1"><i class="fa-solid fa-xmark text-white text-xs"></i></button>
        </div>

        <div class="flex flex-col gap-1.5 font-mono text-[11px] text-[#CCCCCC]">
          <div class="flex justify-between py-1 border-b border-[#2A2A2A]">
            <span class="text-[#858585]">File Name:</span>
            <span class="text-white font-bold">${this.escapeHtml(this.getActiveTab().name)}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-[#2A2A2A]">
            <span class="text-[#858585]">Total Lines:</span>
            <span class="text-white">${lineCount}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-[#2A2A2A]">
            <span class="text-[#858585]">Characters:</span>
            <span class="text-white">${charCount}</span>
          </div>
          <div class="flex justify-between py-1 border-b border-[#2A2A2A]">
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
    const content = this.editorManager.getContent();
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
      <div class="bg-[#1E1E1E] border border-[#333333] w-full h-[85vh] max-w-2xl flex flex-col shadow-2xl">
        <div class="h-8 px-2.5 bg-[#121212] border-b border-[#333333] flex items-center justify-between shrink-0">
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
