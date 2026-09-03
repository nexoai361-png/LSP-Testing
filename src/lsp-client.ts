import { Ace } from "ace-builds";

export class LspClient {
  private ws: WebSocket | null = null;
  private reqId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private uri: string;
  private isInitialized = false;
  private changeTimeout: any = null;
  private documentVersion = 1;
  private connectionStatusCallback?: (status: "connecting" | "connected" | "disconnected" | "error", message?: string) => void;
  private diagnosticMarkers: number[] = [];
  private serverDiagnostics: any[] = [];

  constructor(
    private editor: Ace.Editor,
    private language: "html" | "css",
    statusCallback?: (status: "connecting" | "connected" | "disconnected" | "error", message?: string) => void
  ) {
    this.uri = language === "html" ? "file:///app/index.html" : "file:///app/style.css";
    this.connectionStatusCallback = statusCallback;
    this.connect();
  }

  private connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const path = this.language === "html" ? "/lsp/html" : "/lsp/css";
    
    if (this.connectionStatusCallback) {
      this.connectionStatusCallback("connecting");
    }

    this.ws = new WebSocket(`${protocol}//${host}${path}`);
    
    this.ws.onopen = () => {
      console.log(`[LSP Client] WebSocket opened for ${this.language}`);
      this.sendInitialize();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (err) {
        console.error("[LSP Client] Error parsing incoming message:", err);
      }
    };

    this.ws.onclose = () => {
      console.log(`[LSP Client] WebSocket closed for ${this.language}`);
      this.isInitialized = false;
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback("disconnected");
      }
    };

    this.ws.onerror = (err) => {
      console.error(`[LSP Client] WebSocket error for ${this.language}:`, err);
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback("error", "WebSocket error occurred. Verify LSP is installed.");
      }
    };
  }

  private sendInitialize() {
    this.sendRequest("initialize", {
      processId: null,
      rootPath: "/app",
      rootUri: "file:///app",
      capabilities: {
        workspace: {
          configuration: true
        },
        textDocument: {
          completion: {
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ["markdown", "plaintext"]
            }
          },
          hover: {
            contentFormat: ["markdown", "plaintext"]
          },
          publishDiagnostics: {
            relatedInformation: true
          },
          formatting: {
            dynamicRegistration: true
          }
        }
      }
    }).then((res) => {
      this.isInitialized = true;
      this.sendNotification("initialized", {});
      console.log(`[LSP Client] LSP initialized successfully for ${this.language}`);
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback("connected");
      }
      this.sendDidOpen();
    }).catch((err) => {
      console.error("[LSP Client] Initialization failed:", err);
    });
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket is not connected"));
        return;
      }
      const id = this.reqId++;
      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  }

  private sendNotification(method: string, params: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  private handleMessage(msg: any) {
    // Check if it's a response to a pending request
    if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
      const { resolve, reject } = this.pendingRequests.get(msg.id)!;
      this.pendingRequests.delete(msg.id);
      if (msg.error) {
        reject(msg.error);
      } else {
        resolve(msg.result);
      }
      return;
    }

    // Check if it's a request from the server
    if (msg.id !== undefined && msg.method !== undefined && !this.pendingRequests.has(msg.id)) {
      if (msg.method === "workspace/configuration") {
        const items = msg.params?.items || [];
        const result = items.map((item: any) => {
          if (item.section === "html") {
            return {
              format: { enable: true },
              suggest: { html5: true },
              validate: { styles: true, scripts: true }
            };
          }
          if (item.section === "css") {
            return {
              validate: true
            };
          }
          return {};
        });
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result
          }));
        }
      } else {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result: {}
          }));
        }
      }
      return;
    }

    // Check if it's a notification
    if (msg.method === "textDocument/publishDiagnostics") {
      this.serverDiagnostics = msg.params.diagnostics || [];
      this.refreshDiagnostics();
    } else if (msg.method === "window/showMessage") {
      console.log(`[LSP Message]:`, msg.params.message);
    }
  }

  private sendDidOpen() {
    const text = this.editor.getValue();
    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: this.uri,
        languageId: this.language,
        version: this.documentVersion,
        text
      }
    });
    // Trigger initial diagnostic check
    this.refreshDiagnostics();
  }

  public notifyDocumentChanged() {
    if (!this.isInitialized) return;
    if (this.changeTimeout) clearTimeout(this.changeTimeout);

    // Run diagnostics instantly on change for zero-latency feedback!
    this.refreshDiagnostics();

    this.changeTimeout = setTimeout(() => {
      const text = this.editor.getValue();
      this.documentVersion++;
      this.sendNotification("textDocument/didChange", {
        textDocument: {
          uri: this.uri,
          version: this.documentVersion
        },
        contentChanges: [
          {
            text
          }
        ]
      });
    }, 250); // Debounce to avoid overloading LSP
  }

  private refreshDiagnostics() {
    const session = this.editor.getSession();

    // Clear old markers safely
    if (this.diagnosticMarkers) {
      for (const id of this.diagnosticMarkers) {
        session.removeMarker(id);
      }
    }
    this.diagnosticMarkers = [];

    const aceObj = (window as any).ace;
    const Range = aceObj ? aceObj.require("ace/range").Range : null;

    const text = this.editor.getValue();
    const annotations: Ace.Annotation[] = [];

    // 1. Process server diagnostics (LSP)
    this.serverDiagnostics.forEach((diag: any) => {
      const startRow = diag.range.start.line;
      const startCol = diag.range.start.character;
      const endRow = diag.range.end.line;
      const endCol = diag.range.end.character;
      
      let type: "error" | "warning" | "info" = "info";
      let className = "lsp-info-marker";
      if (diag.severity === 1) {
        type = "error";
        className = "lsp-error-marker";
      } else if (diag.severity === 2) {
        type = "warning";
        className = "lsp-warning-marker";
      }

      if (Range && startRow !== undefined && startCol !== undefined) {
        const adjustedEndCol = (startRow === endRow && startCol === endCol) ? startCol + 1 : endCol;
        const r = new Range(startRow, startCol, endRow, adjustedEndCol);
        const markerId = session.addMarker(r, className, "text");
        this.diagnosticMarkers.push(markerId);
      }

      annotations.push({
        row: startRow,
        column: startCol,
        text: diag.message,
        type
      });
    });

    // 2. If HTML, run our local high-fidelity HTML validator to catch errors
    if (this.language === "html") {
      try {
        const errors: { line: number; col: number; type: "error" | "warning"; message: string; raw?: string }[] = [];
        const tags: { name: string; isClosing: boolean; isSelfClosing: boolean; line: number; col: number; raw: string }[] = [];

        let i = 0;
        let line = 1;
        let col = 1;
        const len = text.length;

        const advance = (n = 1) => {
          for (let k = 0; k < n; k++) {
            if (i >= len) break;
            const char = text[i];
            if (char === '\n') {
              line++;
              col = 1;
            } else {
              col++;
            }
            i++;
          }
        };

        const VOID_ELEMENTS = new Set([
          'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 
          'link', 'meta', 'param', 'source', 'track', 'wbr'
        ]);

        const SELF_CLOSING_ON_NESTING = new Set(['title', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a']);
        const OPTIONAL_CLOSE = new Set(['li', 'dt', 'dd', 'option']);

        // Tokenize HTML Tags & scan for unclosed structures
        while (i < len) {
          const char = text[i];

          // 1. Comments: <!-- ... -->
          if (char === '<' && text.substring(i, i + 4) === '<!--') {
            const startLine = line;
            const startCol = col;
            advance(4);
            let foundClose = false;
            while (i < len) {
              if (text.substring(i, i + 3) === '-->') {
                advance(3);
                foundClose = true;
                break;
              }
              advance();
            }
            if (!foundClose) {
              errors.push({
                line: startLine,
                col: startCol,
                type: 'error',
                message: 'Comment was not closed with "-->"',
                raw: '<!--'
              });
            }
            continue;
          }

          // 2. Doctype or other <! structures
          if (char === '<' && text[i + 1] === '!') {
            advance(2);
            while (i < len && text[i] !== '>') {
              advance();
            }
            if (i < len) advance();
            continue;
          }

          // 3. Normal HTML tags
          if (char === '<' && i + 1 < len && /^[a-zA-Z/!]/.test(text[i + 1])) {
            const startLine = line;
            const startCol = col;
            const tagIndex = i;

            const isClosing = text[i + 1] === '/';
            advance(isClosing ? 2 : 1);

            let tagName = "";
            while (i < len && /^[a-zA-Z0-9:-]/.test(text[i])) {
              tagName += text[i];
              advance();
            }
            tagName = tagName.toLowerCase();

            let isSelfClosing = false;
            let hasClosed = false;
            let inQuote: string | null = null;

            while (i < len) {
              const c = text[i];
              if (inQuote) {
                if (c === inQuote) {
                  inQuote = null;
                }
                advance();
              } else {
                if (c === '"' || c === "'") {
                  inQuote = c;
                  advance();
                } else if (c === '>') {
                  if (text[i - 1] === '/') {
                    isSelfClosing = true;
                  }
                  advance();
                  hasClosed = true;
                  break;
                } else if (c === '<') {
                  break; // Found a new tag before closing this one
                } else {
                  advance();
                }
              }
            }

            const tagRaw = text.substring(tagIndex, i);

            if (!hasClosed) {
              errors.push({
                line: startLine,
                col: startCol,
                type: 'error',
                message: `Tag "${tagName || 'unknown'}" is not closed with ">"`,
                raw: tagRaw
              });
              continue;
            }

            if (tagName) {
              tags.push({
                name: tagName,
                isClosing,
                isSelfClosing,
                line: startLine,
                col: startCol,
                raw: tagRaw
              });
            }
            continue;
          }

          advance();
        }

        // Validate nested structure & tag pairs
        const stack: { name: string; line: number; col: number; raw: string }[] = [];

        for (const tag of tags) {
          if (tag.isClosing) {
            // Auto-pop optional closing tags if parent tag is being closed
            while (stack.length > 0 && OPTIONAL_CLOSE.has(stack[stack.length - 1].name) && stack[stack.length - 1].name !== tag.name) {
              stack.pop();
            }

            if (stack.length === 0) {
              errors.push({
                line: tag.line,
                col: tag.col,
                type: 'error',
                message: `Stray closing tag "</${tag.name}>" without a matching opening tag`,
                raw: tag.raw
              });
            } else {
              const matchIndex = stack.map(t => t.name).lastIndexOf(tag.name);
              if (matchIndex !== -1) {
                for (let j = stack.length - 1; j > matchIndex; j--) {
                  const unclosed = stack[j];
                  errors.push({
                    line: unclosed.line,
                    col: unclosed.col,
                    type: 'error',
                    message: `Tag "${unclosed.name}" was opened but closed by mismatched tag "</${tag.name}>"`,
                    raw: unclosed.raw
                  });
                }
                stack.splice(matchIndex);
              } else {
                const top = stack[stack.length - 1];
                errors.push({
                  line: tag.line,
                  col: tag.col,
                  type: 'error',
                  message: `Mismatched closing tag "</${tag.name}>", expected "</${top.name}>"`,
                  raw: tag.raw
                });
              }
            }
          } else {
            if (tag.isSelfClosing || VOID_ELEMENTS.has(tag.name)) {
              continue;
            }

            // Check if opening nested tag is duplicate of self-closing-on-nesting elements
            if (SELF_CLOSING_ON_NESTING.has(tag.name) && stack.length > 0 && stack[stack.length - 1].name === tag.name) {
              const prev = stack.pop()!;
              errors.push({
                line: prev.line,
                col: prev.col,
                type: 'error',
                message: `Tag "${tag.name}" was closed with an opening tag "<${tag.name}>" instead of "</${tag.name}>"`,
                raw: prev.raw
              });
            }

            stack.push({
              name: tag.name,
              line: tag.line,
              col: tag.col,
              raw: tag.raw
            });
          }
        }

        // Remaining tags in stack are never closed
        for (const unclosed of stack) {
          errors.push({
            line: unclosed.line,
            col: unclosed.col,
            type: 'error',
            message: `Tag "${unclosed.name}" was never closed with a matching "</${unclosed.name}>"`,
            raw: unclosed.raw
          });
        }

        // Add annotations & markers
        errors.forEach((err) => {
          const row = err.line - 1;
          const col = err.col - 1;

          const isDuplicate = annotations.some(ann => ann.row === row && ann.column === col && ann.text === err.message);
          if (!isDuplicate) {
            if (Range) {
              const r = new Range(row, col, row, col + (err.raw ? err.raw.length : 1));
              const markerId = session.addMarker(r, "lsp-error-marker", "text");
              this.diagnosticMarkers.push(markerId);
            }

            annotations.push({
              row,
              column: col,
              text: err.message,
              type: "error"
            });
          }
        });

      } catch (e) {
        console.warn("[LSP Client] Custom HTML validator error:", e);
      }
    }

    session.setAnnotations(annotations);
  }

  private parseDocHtml(text: string | undefined): string | undefined {
    if (!text) return undefined;

    const mdImagePlaceholders: string[] = [];
    const rawImagePlaceholders: string[] = [];

    // 1. Extract markdown-style images with Data URIs: ![alt](data:image/...)
    let processed = text.replace(/!\[([^\]]*)\]\((data:image\/[a-zA-Z+.-]+;[^)\s"'>]+)\)/g, (match, alt, uri) => {
      const placeholder = `__MD_IMAGE_PLACEHOLDER_${mdImagePlaceholders.length}__`;
      const cleanUri = uri.replace(/\s+/g, "");
      const cleanAlt = alt || "image";
      mdImagePlaceholders.push(`<img src="${cleanUri}" alt="${cleanAlt}" referrerpolicy="no-referrer" style="display: block; max-width: 100%; max-height: 100px; object-fit: contain; margin: 4px 0; border: 1px solid #3C3C3C; background: #222222;" />`);
      return placeholder;
    });

    // 2. Extract remaining raw Data URIs that are not in markdown image format
    processed = processed.replace(/(data:image\/[a-zA-Z+.-]+;[^)\s"'>]+)/g, (match, uri) => {
      const placeholder = `__RAW_IMAGE_PLACEHOLDER_${rawImagePlaceholders.length}__`;
      const cleanUri = uri.replace(/\s+/g, "");
      rawImagePlaceholders.push(`<img src="${cleanUri}" alt="embedded image" referrerpolicy="no-referrer" style="display: block; max-width: 100%; max-height: 100px; object-fit: contain; margin: 4px 0; border: 1px solid #3C3C3C; background: #222222;" />`);
      return placeholder;
    });

    // 3. Escape basic HTML tags to prevent broken rendering or XSS
    let escaped = processed
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // 4. Restore image placeholders as safe parsed HTML elements
    mdImagePlaceholders.forEach((htmlVal, index) => {
      escaped = escaped.replace(`__MD_IMAGE_PLACEHOLDER_${index}__`, htmlVal);
    });
    rawImagePlaceholders.forEach((htmlVal, index) => {
      escaped = escaped.replace(`__RAW_IMAGE_PLACEHOLDER_${index}__`, htmlVal);
    });

    // Convert newlines to line breaks
    return escaped.replace(/\r?\n/g, "<br>");
  }

  public async getCompletions(row: number, column: number): Promise<any[]> {
    if (!this.isInitialized) return [];
    try {
      const res = await this.sendRequest("textDocument/completion", {
        textDocument: { uri: this.uri },
        position: { line: row, character: column }
      });
      
      const items = Array.isArray(res) ? res : (res ? res.items || [] : []);
      
      return items.map((item: any) => {
        let insertText = item.insertText || item.label;
        if (item.insertTextFormat === 2) {
          // It's a snippet. Strip basic snippet syntax for simple insertions in vanilla Ace if needed,
          // or let Ace handle standard completions.
          insertText = insertText.replace(/\$\{\d+([^}]+)\}/g, "$1").replace(/\$\d+/g, "");
        }
        
        // Map LSP CompletionItemKind to visual tags
        const kinds = ["", "Text", "Method", "Function", "Constructor", "Field", "Variable", "Class", "Interface", "Module", "Property", "Unit", "Value", "Enum", "Keyword", "Snippet", "Color", "File", "Reference", "Folder", "EnumMember", "Constant", "Struct", "Event", "Operator", "TypeParameter"];
        const kindStr = kinds[item.kind] || "LSP";

        const docVal = item.documentation ? (typeof item.documentation === 'object' ? item.documentation.value : item.documentation) : undefined;

        return {
          caption: item.label,
          value: insertText,
          meta: kindStr,
          score: 1000 + (item.sortText ? 100 - item.sortText.charCodeAt(0) : 0),
          docHTML: this.parseDocHtml(docVal)
        };
      });
    } catch (err) {
      console.warn("[LSP Client] Failed to get completions:", err);
      return [];
    }
  }

  public async getHover(row: number, column: number): Promise<string | null> {
    if (!this.isInitialized) return null;
    try {
      const res = await this.sendRequest("textDocument/hover", {
        textDocument: { uri: this.uri },
        position: { line: row, character: column }
      });
      if (!res || !res.contents) return null;
      
      let val = "";
      if (typeof res.contents === "string") {
        val = res.contents;
      } else if (Array.isArray(res.contents)) {
        val = res.contents.map((c: any) => typeof c === "string" ? c : c.value).join("\n");
      } else if (typeof res.contents === "object") {
        val = res.contents.value || "";
      }
      return val || null;
    } catch (err) {
      console.warn("[LSP Client] Failed to get hover info:", err);
      return null;
    }
  }

  public async format(): Promise<void> {
    if (!this.isInitialized) return;
    try {
      const tabSize = this.editor.getSession().getTabSize();
      const insertSpaces = this.editor.getSession().getUseSoftTabs();
      
      const edits = await this.sendRequest("textDocument/formatting", {
        textDocument: { uri: this.uri },
        options: {
          tabSize,
          insertSpaces
        }
      });

      if (edits && edits.length > 0) {
        // Apply text edits from LSP
        // Since Ace values can change, we sort edits descending to prevent range offsets
        const sortedEdits = [...edits].sort((a: any, b: any) => {
          if (a.range.start.line !== b.range.start.line) {
            return b.range.start.line - a.range.start.line;
          }
          return b.range.start.character - a.range.start.character;
        });

        const doc = this.editor.getSession().getDocument();
        for (const edit of sortedEdits) {
          const range = {
            start: { row: edit.range.start.line, column: edit.range.start.character },
            end: { row: edit.range.end.line, column: edit.range.end.character }
          };
          doc.replace(range as any, edit.newText);
        }
        console.log("[LSP Client] Format applied successfully");
      }
    } catch (err) {
      console.warn("[LSP Client] Formatting failed:", err);
    }
  }

  public shutdown() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.changeTimeout) {
      clearTimeout(this.changeTimeout);
    }
    
    // Clear diagnostic markers and annotations in the editor session
    const session = this.editor.getSession();
    if (this.diagnosticMarkers) {
      for (const id of this.diagnosticMarkers) {
        session.removeMarker(id);
      }
    }
    this.diagnosticMarkers = [];
    session.setAnnotations([]);
  }
}
