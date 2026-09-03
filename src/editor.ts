import ace from './ace-setup';
import 'ace-builds/css/ace.css';
import 'ace-builds/src-noconflict/mode-typescript';
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/mode-html';
import 'ace-builds/src-noconflict/mode-css';
import 'ace-builds/src-noconflict/mode-python';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/mode-markdown';
import 'ace-builds/src-noconflict/mode-c_cpp';
import 'ace-builds/src-noconflict/mode-java';
import 'ace-builds/src-noconflict/mode-sql';
import 'ace-builds/src-noconflict/mode-php';

import 'ace-builds/src-noconflict/theme-one_dark';
import 'ace-builds/src-noconflict/theme-github_dark';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/theme-dracula';
import 'ace-builds/src-noconflict/theme-twilight';
import 'ace-builds/src-noconflict/theme-nord_dark';

import 'ace-builds/src-noconflict/ext-searchbox';
import 'ace-builds/src-noconflict/ext-keybinding_menu';
import 'ace-builds/src-noconflict/ext-prompt';
import 'ace-builds/src-noconflict/ext-language_tools';
import 'ace-builds/src-noconflict/ext-options';
import 'ace-builds/src-noconflict/ext-settings_menu';

import { CursorPosition, EditorSettings } from './types';
import { LspClient } from './lsp-client';

export class CodeEditorManager {
  private editor: ace.Ace.Editor | null = null;
  private onCursorChangeCallback?: (pos: CursorPosition) => void;
  private onChangeCallback?: (content: string) => void;
  private lspClient: LspClient | null = null;

  public init(
    container: HTMLElement,
    settings: EditorSettings,
    initialContent: string,
    initialMode: string,
    onCursorChange: (pos: CursorPosition) => void,
    onChange: (content: string) => void,
    onFocus?: () => void
  ): ace.Ace.Editor {
    const aceObj = (ace as any).default || ace;
    if (aceObj && aceObj.config) {
      aceObj.config.set('basePath', './');
      aceObj.config.set('modePath', './');
      aceObj.config.set('themePath', './');
      aceObj.config.set('workerPath', './');
      aceObj.config.set('packaged', true);
      (aceObj.config as any).set('useWorker', false);
      (aceObj.config as any).set('loadWorkerFromBlob', false);
    }

    this.registerVsCodeDarkTheme(aceObj);

    this.editor = aceObj.edit(container, {
      value: initialContent,
      mode: initialMode,
      theme: settings.theme || 'ace/theme/vscode_dark',
      fontFamily: "'Fira Code', 'Roboto Mono', monospace",
      fontSize: settings.fontSize + 'px',
      tabSize: settings.tabSize,
      useSoftTabs: settings.useSoftTabs,
      showPrintMargin: false,
      highlightActiveLine: settings.highlightActiveLine,
      showLineNumbers: settings.showLineNumbers,
      showGutter: settings.showGutter,
      wrap: settings.wordWrap,
      behavioursEnabled: true,
      autoScrollEditorIntoView: true,
      copyWithEmptySelection: true,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: true,
    });

    this.editor.getSession().setUseWorker(false);

    this.onCursorChangeCallback = onCursorChange;
    this.onChangeCallback = onChange;

    if (onFocus) {
      this.editor.on('focus', () => {
        onFocus();
      });
    }

    // Register custom LSP completer
    const langTools = (aceObj as any).require ? (aceObj as any).require('ace/ext/language_tools') : null;
    if (langTools) {
      langTools.setCompleters([]); // Clear default completers to avoid duplicates
      langTools.addCompleter({
        getCompletions: async (editor: any, session: any, pos: any, prefix: any, callback: any) => {
          if (this.lspClient) {
            const list = await this.lspClient.getCompletions(pos.row, pos.column);
            callback(null, list);
          } else {
            callback(null, []);
          }
        }
      });
    }

    // Custom LSP Hover Tooltip
    let hoverTooltip: HTMLDivElement | null = null;
    let hoverTimeout: any = null;
    let isInsideTooltip = false;

    const renderHoverHtml = (text: string): string => {
      if (!text) return "";

      const mdImagePlaceholders: string[] = [];
      const rawImagePlaceholders: string[] = [];

      // 1. Extract markdown-style images with Data URIs: ![alt](data:image/...)
      let processed = text.replace(/!\[([^\]]*)\]\((data:image\/[a-zA-Z+.-]+;[^)\s"'>]+)\)/g, (match, alt, uri) => {
        const placeholder = `__MD_IMAGE_PLACEHOLDER_${mdImagePlaceholders.length}__`;
        const cleanUri = uri.replace(/\s+/g, "");
        const cleanAlt = alt || "image";
        mdImagePlaceholders.push(`<img src="${cleanUri}" alt="${cleanAlt}" referrerpolicy="no-referrer" style="display: block; max-width: 100%; max-height: 140px; object-fit: contain; margin: 6px 0; border: 1px solid #3C3C3C; background: #222222;" />`);
        return placeholder;
      });

      // 2. Extract remaining raw Data URIs that are not in markdown image format
      processed = processed.replace(/(data:image\/[a-zA-Z+.-]+;[^)\s"'>]+)/g, (match, uri) => {
        const placeholder = `__RAW_IMAGE_PLACEHOLDER_${rawImagePlaceholders.length}__`;
        const cleanUri = uri.replace(/\s+/g, "");
        rawImagePlaceholders.push(`<img src="${cleanUri}" alt="embedded image" referrerpolicy="no-referrer" style="display: block; max-width: 100%; max-height: 140px; object-fit: contain; margin: 6px 0; border: 1px solid #3C3C3C; background: #222222;" />`);
        return placeholder;
      });

      // 3. Escape basic HTML tags to prevent broken rendering or XSS
      let escaped = processed
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      // 4. Replace markdown links with neat MDN Reference links (without full URL text, keeping only "MDN Reference")
      escaped = escaped.replace(/\\?\[([^\]]+)\\?\]\((https?:\/\/[^\s)]+)\)/g, (match, linkText, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline; font-weight: 600; cursor: pointer;">MDN Reference</a>`;
      });

      // Replace any remaining raw http/https links with MDN Reference links
      escaped = escaped.replace(/(?<!href=")(https?:\/\/[^\s\)\>"]+)/g, (match) => {
        let url = match;
        let trailing = "";
        const punc = /[.,;:)\\]+$/;
        const m = url.match(punc);
        if (m) {
          trailing = m[0];
          url = url.slice(0, -trailing.length);
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #3b82f6; text-decoration: underline; font-weight: 600; cursor: pointer;">MDN Reference</a>${trailing}`;
      });

      // 5. Restore image placeholders as safe parsed HTML elements
      mdImagePlaceholders.forEach((htmlVal, index) => {
        escaped = escaped.replace(`__MD_IMAGE_PLACEHOLDER_${index}__`, htmlVal);
      });
      rawImagePlaceholders.forEach((htmlVal, index) => {
        escaped = escaped.replace(`__RAW_IMAGE_PLACEHOLDER_${index}__`, htmlVal);
      });

      // Convert newlines to line breaks
      return escaped.replace(/\r?\n/g, "<br>");
    };

    const showHoverAt = async (row: number, column: number, clientX: number, clientY: number) => {
      if (!this.lspClient) return;
      const hoverText = await this.lspClient.getHover(row, column);
      if (!hoverText) {
        hideHover();
        return;
      }

      if (!hoverTooltip) {
        hoverTooltip = document.createElement('div');
        hoverTooltip.className = 'fixed bg-[#1e1e1e] text-[#cccccc] border border-[#454545] rounded-md p-3 text-xs shadow-2xl z-[99999] pointer-events-auto whitespace-normal leading-relaxed transition-opacity duration-150 font-[\'Lato\',sans-serif]';
        
        hoverTooltip.addEventListener('mouseenter', () => {
          isInsideTooltip = true;
        });

        hoverTooltip.addEventListener('mouseleave', () => {
          isInsideTooltip = false;
          hideHover();
        });

        document.body.appendChild(hoverTooltip);
      }

      hoverTooltip.innerHTML = renderHoverHtml(hoverText);

      // Adjust dimensions dynamically
      hoverTooltip.style.width = '280px';
      hoverTooltip.style.maxWidth = 'calc(100vw - 32px)';
      hoverTooltip.style.boxSizing = 'border-box';
      hoverTooltip.style.overflowWrap = 'break-word';
      hoverTooltip.style.wordBreak = 'break-word';
      hoverTooltip.style.maxHeight = '240px';
      hoverTooltip.style.overflowY = 'auto';

      const tooltipWidth = hoverTooltip.offsetWidth || 280;
      const tooltipHeight = hoverTooltip.offsetHeight || 60;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = clientX + 12;
      let top = clientY + 18;

      // Prevent overflow horizontally
      if (left + tooltipWidth > viewportWidth - 16) {
        left = Math.max(16, clientX - tooltipWidth - 12);
      }

      // Prevent overflow vertically
      if (top + tooltipHeight > viewportHeight - 16) {
        top = Math.max(16, clientY - tooltipHeight - 12);
      }

      hoverTooltip.style.left = `${left}px`;
      hoverTooltip.style.top = `${top}px`;
      hoverTooltip.style.opacity = '1';
    };

    const hideHover = () => {
      if (isInsideTooltip) return;
      if (hoverTooltip) {
        hoverTooltip.style.opacity = '0';
        const el = hoverTooltip;
        setTimeout(() => {
          if (el && el.style.opacity === '0' && !isInsideTooltip) {
            el.remove();
            if (hoverTooltip === el) hoverTooltip = null;
          }
        }, 150);
      }
    };

    const mouseTarget = this.editor.renderer.getMouseEventTarget();
    mouseTarget.addEventListener('mousemove', (e: MouseEvent) => {
      if (isInsideTooltip) return;
      if (hoverTimeout) clearTimeout(hoverTimeout);
      if (!this.lspClient) return;

      hoverTimeout = setTimeout(() => {
        if (isInsideTooltip) return;
        const pos = this.editor!.renderer.screenToTextCoordinates(e.clientX, e.clientY);
        if (pos) {
          showHoverAt(pos.row, pos.column, e.clientX, e.clientY);
        }
      }, 500);
    });

    mouseTarget.addEventListener('mouseout', (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement;
      if (related && (related === hoverTooltip || hoverTooltip?.contains(related))) {
        return;
      }
      if (hoverTimeout) clearTimeout(hoverTimeout);
      setTimeout(() => {
        if (!isInsideTooltip) {
          hideHover();
        }
      }, 100);
    });

    this.updateLsp(initialMode);

    // Custom CSS styling overrides
    this.editor.renderer.setScrollMargin(6, 6, 6, 6);
    this.editor.setShowFoldWidgets(true);

    // Ensure editor resizes properly after DOM mount
    requestAnimationFrame(() => {
      if (this.editor) {
        this.editor.resize(true);
      }
    });

    // Track Cursor and Selection
    this.editor.selection.on('changeCursor', () => this.updateCursorStats());
    this.editor.selection.on('changeSelection', () => this.updateCursorStats());

    // Track Content Changes
    this.editor.on('change', () => {
      if (this.onChangeCallback && this.editor) {
        this.onChangeCallback(this.editor.getValue());
      }
      if (this.lspClient) {
        this.lspClient.notifyDocumentChanged();
      }
    });

    // Register Ace Built-in Command Palette Commands (F1 / Ctrl+Shift+P / Cmd+Shift+P / Alt+X)
    const triggerPrompt = (ed: any) => {
      try {
        const aceObj = (ace as any).default || ace;
        const promptModule = (aceObj as any).require ? (aceObj as any).require('ace/ext/prompt') : null;
        if (promptModule) {
          const promptFn = promptModule.prompt || promptModule;
          if (promptFn && typeof promptFn.commands === 'function') {
            promptFn.commands(ed);
            return;
          }
          if (typeof promptFn === 'function') {
            promptFn(ed, '', 'commands');
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to trigger Ace built-in prompt:', err);
      }
    };

    this.editor.commands.addCommand({
      name: 'openCommandPalette',
      bindKey: { win: 'F1|Ctrl-Shift-P|Alt-X', mac: 'F1|Cmd-Shift-P|Alt-X' },
      exec: triggerPrompt,
    });

    this.editor.commands.addCommand({
      name: 'openCommandPallete',
      bindKey: { win: 'F1|Ctrl-Shift-P|Alt-X', mac: 'F1|Cmd-Shift-P|Alt-X' },
      exec: triggerPrompt,
    });

    this.editor.commands.addCommand({
      name: 'showKeyboardShortcuts',
      bindKey: { win: 'Ctrl-Alt-h', mac: 'Cmd-Alt-h' },
      exec: (ed: any) => {
        try {
          const aceObj = (ace as any).default || ace;
          const kbMenu = (aceObj as any).require ? (aceObj as any).require('ace/ext/keybinding_menu') : null;
          if (kbMenu) {
            if (typeof kbMenu.showKeyboardShortcuts === 'function') {
              kbMenu.showKeyboardShortcuts(ed);
              return;
            }
            if (typeof kbMenu.init === 'function') {
              kbMenu.init(ed);
            }
          }
          if (typeof ed.showKeyboardShortcuts === 'function') {
            ed.showKeyboardShortcuts();
          }
        } catch (e) {
          console.warn('Failed to show keyboard shortcuts:', e);
        }
      },
    });

    this.updateCursorStats();
    return this.editor;
  }

  public openAceCommandPalette(): void {
    if (!this.editor) return;
    this.editor.focus();
    const aceObj = (ace as any).default || ace;
    try {
      const promptModule = (aceObj as any).require ? (aceObj as any).require('ace/ext/prompt') : null;
      if (promptModule) {
        const promptFn = promptModule.prompt || promptModule;
        if (promptFn && typeof promptFn.commands === 'function') {
          promptFn.commands(this.editor);
          return;
        }
        if (typeof promptFn === 'function') {
          promptFn(this.editor, '', 'commands');
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to open Ace prompt.commands:', e);
    }
    if (this.editor.commands) {
      this.editor.execCommand('openCommandPalette');
    }
  }

  public setContent(content: string, mode?: string): void {
    if (!this.editor) return;
    const session = this.editor.getSession();
    session.setValue(content);
    if (mode) {
      session.setMode(mode);
      session.setUseWorker(false);
      this.updateLsp(mode);
    }
    this.editor.clearSelection();
    this.editor.gotoLine(1, 0, false);
    this.updateCursorStats();
  }

  public getContent(): string {
    return this.editor ? this.editor.getValue() : '';
  }

  public setMode(mode: string): void {
    if (this.editor) {
      const session = this.editor.getSession();
      session.setMode(mode);
      session.setUseWorker(false);
      this.updateLsp(mode);
    }
  }

  public setTheme(theme: string): void {
    if (this.editor) {
      this.editor.setTheme(theme);
    }
  }

  public updateSettings(settings: EditorSettings): void {
    if (!this.editor) return;
    this.editor.setTheme(settings.theme);
    this.editor.setFontSize(settings.fontSize + 'px');
    this.editor.getSession().setTabSize(settings.tabSize);
    this.editor.getSession().setUseSoftTabs(settings.useSoftTabs);
    this.editor.getSession().setUseWrapMode(settings.wordWrap);
    this.editor.setHighlightActiveLine(settings.highlightActiveLine);
    this.editor.setOption('showLineNumbers', settings.showLineNumbers);
    this.editor.setOption('showGutter', settings.showGutter);
    this.editor.renderer.updateFull();
  }

  public insertText(text: string): void {
    if (!this.editor) return;
    this.editor.insert(text);
    this.editor.focus();
  }

  public indent(): void {
    if (!this.editor) return;
    this.editor.indent();
    this.editor.focus();
  }

  public outdent(): void {
    if (!this.editor) return;
    this.editor.blockOutdent();
    this.editor.focus();
  }

  public toggleComment(): void {
    if (!this.editor) return;
    this.editor.toggleCommentLines();
    this.editor.focus();
  }

  public duplicateLine(): void {
    if (!this.editor) return;
    this.editor.duplicateSelection();
    this.editor.focus();
  }

  public undo(): void {
    if (!this.editor) return;
    this.editor.undo();
    this.editor.focus();
  }

  public redo(): void {
    if (!this.editor) return;
    this.editor.redo();
    this.editor.focus();
  }

  public gotoLine(line: number): void {
    if (!this.editor) return;
    this.editor.gotoLine(line, 0, true);
    this.editor.focus();
  }

  public openSearch(): void {
    if (!this.editor) return;
    this.editor.execCommand('find');
  }

  public execCommand(command: string, args?: any): void {
    if (!this.editor) return;
    this.editor.execCommand(command, args);
    this.editor.focus();
  }

  public showKeyboardShortcuts(): void {
    if (!this.editor) return;
    this.editor.execCommand('showKeyboardShortcuts');
  }

  public getEditorInstance(): ace.Ace.Editor | null {
    return this.editor;
  }

  public resize(): void {
    if (this.editor) {
      this.editor.resize(true);
    }
  }

  public focus(): void {
    if (this.editor) {
      this.editor.focus();
    }
  }

  private updateCursorStats(): void {
    if (!this.editor || !this.onCursorChangeCallback) return;
    const pos = this.editor.getCursorPosition();
    const totalLines = this.editor.getSession().getLength();
    const selectedText = this.editor.getSelectedText();

    this.onCursorChangeCallback({
      row: pos.row + 1,
      column: pos.column + 1,
      totalLines,
      selectedTextLength: selectedText ? selectedText.length : 0,
    });
  }

  private registerVsCodeDarkTheme(aceObj: any): void {
    if (!aceObj || !aceObj.define) return;

    aceObj.define('ace/theme/vscode_dark-css', ['require', 'exports', 'module'], function(_require: any, exports: any, _module: any) {
      exports.cssText = `
.ace-vscode-dark .ace_gutter {
    background: #181818;
    color: #858585;
}
.ace-vscode-dark .ace_print-margin {
    width: 1px;
    background: #222222;
}
.ace-vscode-dark {
    background-color: #1e1e1e;
    color: #d4d4d4;
}
.ace-vscode-dark .ace_cursor {
    color: #aeafad;
}
.ace-vscode-dark .ace_marker-layer .ace_selection {
    background: #264f78;
}
.ace-vscode-dark.ace_multiselect .ace_selection.ace_start {
    box-shadow: 0 0 3px 0px #1e1e1e;
}
.ace-vscode-dark .ace_marker-layer .ace_step {
    background: rgb(102, 82, 0);
}
.ace-vscode-dark .ace_marker-layer .ace_bracket {
    margin: -1px 0 0 -1px;
    border: 1px solid #3b3a32;
}
.ace-vscode-dark .ace_marker-layer .ace_active-line {
    background: #282828;
}
.ace-vscode-dark .ace_gutter-active-line {
    background-color: #282828;
    color: #cccccc;
}
.ace-vscode-dark .ace_marker-layer .ace_selected-word {
    border: 1px solid #3a3d41;
}
.ace-vscode-dark .ace_invisible {
    color: #3b3a32;
}
.ace-vscode-dark .ace_entity.ace_name.ace_tag,
.ace-vscode-dark .ace_keyword,
.ace-vscode-dark .ace_meta.ace_tag,
.ace-vscode-dark .ace_storage {
    color: #569cd6;
}
.ace-vscode-dark .ace_punctuation,
.ace-vscode-dark .ace_punctuation.ace_tag {
    color: #d4d4d4;
}
.ace-vscode-dark .ace_constant.ace_character,
.ace-vscode-dark .ace_constant.ace_language,
.ace-vscode-dark .ace_constant.ace_numeric,
.ace-vscode-dark .ace_constant.ace_other {
    color: #b5cea8;
}
.ace-vscode-dark .ace_invalid {
    color: #f44747;
    background-color: #1e1e1e;
}
.ace-vscode-dark .ace_invalid.ace_deprecated {
    color: #f44747;
    background-color: #1e1e1e;
}
.ace-vscode-dark .ace_support.ace_constant {
    color: #4ec9b0;
}
.ace-vscode-dark .ace_support.ace_function {
    color: #dcdcaa;
}
.ace-vscode-dark .ace_fold {
    background-color: #569cd6;
    border-color: #d4d4d4;
}
.ace-vscode-dark .ace_storage.ace_type,
.ace-vscode-dark .ace_support.ace_class,
.ace-vscode-dark .ace_support.ace_type {
    color: #4ec9b0;
}
.ace-vscode-dark .ace_entity.ace_name.ace_function,
.ace-vscode-dark .ace_entity.ace_other.ace_attribute-name {
    color: #dcdcaa;
}
.ace-vscode-dark .ace_variable {
    color: #9cdcfe;
}
.ace-vscode-dark .ace_string {
    color: #ce9178;
}
.ace-vscode-dark .ace_string.ace_regex {
    color: #d16969;
}
.ace-vscode-dark .ace_comment {
    color: #6a9955;
    font-style: italic;
}
.ace-vscode-dark .ace_indent-guide {
    background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACChO3AAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAARElEQVQIW2A8f/78fwYGBgYGAB42A6FOHXlKAAAAAElEQVR42mNkYPj/HwADBgEAE4A6aQAAAABJRU5ErkJggg==") right repeat-y;
}
.ace-vscode-dark .ace_search {
    background-color: #252526;
    color: #cccccc;
    border: 1px solid #333333;
}
.ace-vscode-dark .ace_search_field {
    background-color: #1e1e1e;
    color: #ffffff;
    border: 1px solid #333333;
}
.ace-vscode-dark .ace_searchbtn {
    background-color: #333333;
    color: #ffffff;
}
.ace-vscode-dark .ace_searchbtn:hover {
    background-color: #007acc;
}
`;
    });

    aceObj.define('ace/theme/vscode_dark', ['require', 'exports', 'module', 'ace/theme/vscode_dark-css', 'ace/lib/dom'], function(require: any, exports: any, _module: any) {
      exports.isDark = true;
      exports.cssClass = 'ace-vscode-dark';
      exports.cssText = require('ace/theme/vscode_dark-css');
      exports.$showGutterCursorMarker = true;
      var dom = require('ace/lib/dom');
      dom.importCssString(exports.cssText, exports.cssClass, false);
    });
  }

  private updateLsp(mode: string): void {
    if (this.lspClient) {
      this.lspClient.shutdown();
      this.lspClient = null;
    }

    if (!this.editor) return;

    // Reset annotations in gutter
    this.editor.getSession().setAnnotations([]);

    const isHtml = mode === 'ace/mode/html';
    const isCss = mode === 'ace/mode/css';

    if (isHtml || isCss) {
      const lang = isHtml ? 'html' : 'css';
      this.lspClient = new LspClient(this.editor, lang, (status, msg) => {
        this.updateLspStatusIndicator(status, msg);
      });
    } else {
      this.updateLspStatusIndicator('offline');
    }
  }

  private updateLspStatusIndicator(status: string, message?: string): void {
    const el = document.getElementById('status-lsp');
    if (!el) return;
    
    if (status === 'connecting') {
      el.textContent = 'LSP: Connecting...';
      el.className = 'ml-2 px-1 rounded bg-amber-600 text-white text-[9px] font-bold';
      el.title = 'Connecting to LSP server...';
    } else if (status === 'connected') {
      el.textContent = 'LSP: Ready';
      el.className = 'ml-2 px-1 rounded bg-emerald-600 text-white text-[9px] font-bold';
      el.title = 'Language server is connected and fully operational.';
    } else if (status === 'error') {
      el.textContent = 'LSP: Error';
      el.className = 'ml-2 px-1 rounded bg-rose-600 text-white text-[9px] font-bold';
      el.title = message || 'LSP encountered an error.';
    } else {
      el.textContent = 'LSP: Offline';
      el.className = 'ml-2 px-1 rounded bg-[#444444] text-gray-300 text-[9px] font-bold';
      el.title = 'Language server is offline. (Supported for HTML & CSS)';
    }
  }

  public async formatCurrentFile(): Promise<void> {
    if (this.lspClient) {
      await this.lspClient.format();
    }
  }
}
