import { FileTab, LanguageOption, ThemeOption } from './types';

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { id: 'typescript', name: 'TypeScript', aceMode: 'ace/mode/typescript', extension: 'ts' },
  { id: 'javascript', name: 'JavaScript', aceMode: 'ace/mode/javascript', extension: 'js' },
  { id: 'html', name: 'HTML5', aceMode: 'ace/mode/html', extension: 'html' },
  { id: 'css', name: 'CSS3', aceMode: 'ace/mode/css', extension: 'css' },
  { id: 'python', name: 'Python 3', aceMode: 'ace/mode/python', extension: 'py' },
  { id: 'json', name: 'JSON', aceMode: 'ace/mode/json', extension: 'json' },
  { id: 'markdown', name: 'Markdown', aceMode: 'ace/mode/markdown', extension: 'md' },
  { id: 'c_cpp', name: 'C / C++', aceMode: 'ace/mode/c_cpp', extension: 'cpp' },
  { id: 'java', name: 'Java', aceMode: 'ace/mode/java', extension: 'java' },
  { id: 'sql', name: 'SQL', aceMode: 'ace/mode/sql', extension: 'sql' },
  { id: 'php', name: 'PHP', aceMode: 'ace/mode/php', extension: 'php' },
];

export const AVAILABLE_THEMES: ThemeOption[] = [
  { id: 'vscode_dark', name: 'VS Code Dark', aceTheme: 'ace/theme/vscode_dark', isDark: true },
  { id: 'one_dark', name: 'One Dark Pro', aceTheme: 'ace/theme/one_dark', isDark: true },
  { id: 'github_dark', name: 'GitHub Dark', aceTheme: 'ace/theme/github_dark', isDark: true },
  { id: 'monokai', name: 'Monokai Pro', aceTheme: 'ace/theme/monokai', isDark: true },
  { id: 'dracula', name: 'Dracula', aceTheme: 'ace/theme/dracula', isDark: true },
  { id: 'twilight', name: 'Twilight (AMOLED)', aceTheme: 'ace/theme/twilight', isDark: true },
  { id: 'nord_dark', name: 'Nord Dark', aceTheme: 'ace/theme/nord_dark', isDark: true },
];

export const INITIAL_FILES: FileTab[] = [
  {
    id: 'tab-1',
    name: 'main.ts',
    language: 'ace/mode/typescript',
    content: `/**
 * Android Mobile Code Editor
 * Built with Ace Editor & TypeScript
 */

interface DeviceMetrics {
  platform: string;
  isTouchEnabled: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

class MobileApp {
  private name: string;
  private version: string;

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
  }

  public getInfo(): DeviceMetrics {
    return {
      platform: "Android AMOLED",
      isTouchEnabled: true,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  public run(): void {
    const metrics = this.getInfo();
    console.log(\`[\${this.name} v\${this.version}] Active on \${metrics.platform}\`);
  }
}

// Initialize application
const app = new MobileApp("Ace Mobile IDE", "1.0.0");
app.run();
`
  },
  {
    id: 'tab-2',
    name: 'index.html',
    language: 'ace/mode/html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mobile Visual Canvas</title>
  <style>
    body {
      background-color: #000000;
      color: #007ACC;
      font-family: system-ui, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Hello Android Developer</h1>
    <p>High performance mobile editor active.</p>
  </div>
</body>
</html>
`
  },
  {
    id: 'tab-3',
    name: 'script.py',
    language: 'ace/mode/python',
    content: `# Python 3 Mobile Algorithm Script
import math
import time

def calculate_fibonacci(n: int) -> list:
    """Generate Fibonacci series up to n terms."""
    if n <= 0:
        return []
    elif n == 1:
        return [0]
    
    sequence = [0, 1]
    for i in range(2, n):
        next_val = sequence[-1] + sequence[-2]
        sequence.append(next_val)
    return sequence

if __name__ == "__main__":
    start = time.time()
    terms = 15
    result = calculate_fibonacci(terms)
    elapsed = (time.time() - start) * 1000
    
    print(f"Fibonacci ({terms} terms): {result}")
    print(f"Computed in {elapsed:.2f} ms")
`
  },
  {
    id: 'tab-4',
    name: 'styles.css',
    language: 'ace/mode/css',
    content: `/* AMOLED High-Density Styles */
:root {
  --bg-amoled: #000000;
  --bg-surface: #1E1E1E;
  --accent-blue: #007ACC;
  --border-color: #333333;
  --text-main: #FFFFFF;
}

.editor-container {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 0px; /* Sharp geometry rule */
  color: var(--text-main);
  box-sizing: border-box;
}

.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 24px;
  background-color: #007ACC;
  color: #FFFFFF;
  font-size: 12px;
  padding: 0 8px;
}
`
  },
  {
    id: 'tab-5',
    name: 'config.json',
    language: 'ace/mode/json',
    content: `{
  "appName": "Code Editor Mobile",
  "version": "1.0.0",
  "targetOS": "Android",
  "amoledMode": true,
  "editorConfig": {
    "fontFamily": "Fira Code",
    "fontSize": 14,
    "tabSize": 2,
    "wordWrap": true,
    "showLineNumbers": true
  },
  "quickKeys": [
    "{", "}", "[", "]", "(", ")", "<", ">", "=", ";", ":", "\"", "'", "+", "-", "*", "/", "$", "_", "|", "&", "!", "Tab"
  ]
}
`
  }
];
