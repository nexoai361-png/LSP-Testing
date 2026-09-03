import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, ChildProcessByStdio } from "child_process";
import { Writable, Readable } from "stream";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LspStreamParser {
  private buffer = Buffer.alloc(0);

  constructor(private onMessage: (msg: any) => void) {}

  public append(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parse();
  }

  private parse() {
    while (true) {
      const str = this.buffer.toString('utf8');
      const contentLengthIndex = str.indexOf('Content-Length:');
      if (contentLengthIndex === -1) {
        break;
      }

      const headerEndIndex = str.indexOf('\r\n\r\n', contentLengthIndex);
      if (headerEndIndex === -1) {
        break;
      }

      const header = str.substring(contentLengthIndex, headerEndIndex);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEndIndex + 4);
        continue;
      }

      const contentLength = parseInt(match[1], 10);
      const headerLengthInBytes = Buffer.byteLength(str.substring(0, headerEndIndex + 4), 'utf8');
      
      if (this.buffer.length < headerLengthInBytes + contentLength) {
        break;
      }

      const bodyBuffer = this.buffer.subarray(headerLengthInBytes, headerLengthInBytes + contentLength);
      const bodyStr = bodyBuffer.toString('utf8');

      try {
        const msg = JSON.parse(bodyStr);
        this.onMessage(msg);
      } catch (err) {
        console.error('Failed to parse JSON-RPC body:', err, bodyStr);
      }

      this.buffer = this.buffer.subarray(headerLengthInBytes + contentLength);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Simple API healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "LSP proxy and editor server is running." });
  });

  let vite: any;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[LSP Server] Listening on http://0.0.0.0:${PORT}`);
  });

  // Attach WebSocket Server for LSP
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    
    if (pathname === "/lsp/html" || pathname === "/lsp/css") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      if (vite && process.env.NODE_ENV !== "production") {
        // Let Vite handle its own HMR ws upgrade if needed
      } else {
        socket.destroy();
      }
    }
  });

  wss.on("connection", (ws: WebSocket, request) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const isHtml = url.pathname === "/lsp/html";
    const language = isHtml ? "html" : "css";
    
    console.log(`[LSP] Client connected for ${language.toUpperCase()}`);

    // Try starting the standard VS Code LSP binaries with --stdio
    const binName = isHtml ? "vscode-html-language-server" : "vscode-css-language-server";
    
    let child: any = null;
    try {
      child = spawn(binName, ["--stdio"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env
      });
    } catch (spawnError) {
      console.error(`[LSP] Failed to spawn ${binName} direct:`, spawnError);
    }

    if (!child || !child.pid) {
      // Try fallback binary names
      const fallbackBin = isHtml ? "html-languageserver" : "css-languageserver";
      try {
        child = spawn(fallbackBin, ["--stdio"], {
          stdio: ["pipe", "pipe", "pipe"],
          env: process.env
        });
        console.log(`[LSP] Spawned fallback binary: ${fallbackBin}`);
      } catch (err) {
        console.error(`[LSP] Failed to spawn fallback binary ${fallbackBin}:`, err);
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          method: "window/showMessage",
          params: {
            type: 1, // Error
            message: `Could not launch ${language.toUpperCase()} LSP server. Please ensure 'npm install -g vscode-langservers-extracted' is run in your PRoot-Ubuntu environment.`
          }
        }));
        ws.close();
        return;
      }
    }

    const parser = new LspStreamParser((msg) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    });

    child.stdout.on("data", (chunk: Buffer) => {
      parser.append(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      console.error(`[LSP Server Error - ${language}]:`, chunk.toString('utf8'));
    });

    child.on("close", (code: number) => {
      console.log(`[LSP] ${language.toUpperCase()} language server process exited with code ${code}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    ws.on("message", (messageData) => {
      try {
        const payloadStr = messageData.toString();
        const payloadBytes = Buffer.byteLength(payloadStr, 'utf8');
        const formatted = `Content-Length: ${payloadBytes}\r\n\r\n${payloadStr}`;
        
        if (child && child.stdin && child.stdin.writable) {
          child.stdin.write(formatted);
        }
      } catch (err) {
        console.error(`[LSP] Error sending message to ${language} server stdin:`, err);
      }
    });

    ws.on("close", () => {
      console.log(`[LSP] Connection closed for ${language.toUpperCase()}`);
      if (child) {
        try {
          child.kill("SIGTERM");
        } catch (e) {
          // ignore
        }
      }
    });

    ws.on("error", (err) => {
      console.error(`[LSP] WebSocket Error:`, err);
      if (child) {
        try {
          child.kill("SIGINT");
        } catch (e) {}
      }
    });
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
