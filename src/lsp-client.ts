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

    // Check if it's a notification
    if (msg.method === "textDocument/publishDiagnostics") {
      this.handleDiagnostics(msg.params);
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
  }

  public notifyDocumentChanged() {
    if (!this.isInitialized) return;
    if (this.changeTimeout) clearTimeout(this.changeTimeout);

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

  private handleDiagnostics(params: any) {
    if (params.uri !== this.uri) return;
    const diagnostics = params.diagnostics || [];
    
    const annotations: Ace.Annotation[] = diagnostics.map((diag: any) => {
      // LSP is 0-indexed line & character
      const row = diag.range.start.line;
      const column = diag.range.start.character;
      
      let type: "error" | "warning" | "info" = "info";
      if (diag.severity === 1) type = "error";
      else if (diag.severity === 2) type = "warning";

      return {
        row,
        column,
        text: diag.message,
        type
      };
    });

    this.editor.getSession().setAnnotations(annotations);
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

        return {
          caption: item.label,
          value: insertText,
          meta: kindStr,
          score: 1000 + (item.sortText ? 100 - item.sortText.charCodeAt(0) : 0),
          docHTML: item.documentation ? (typeof item.documentation === 'object' ? item.documentation.value : item.documentation) : undefined
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
  }
}
