export interface FileTab {
  id: string;
  name: string;
  language: string; // Ace mode name, e.g., 'typescript', 'python', 'html'
  content: string;
  isUnsaved?: boolean;
  readOnly?: boolean;
}

export interface EditorSettings {
  theme: string; // e.g., 'ace/theme/vscode', 'ace/theme/monokai'
  fontSize: number; // e.g., 14
  tabSize: number; // e.g., 2 or 4
  useSoftTabs: boolean; // true = spaces, false = tabs
  wordWrap: boolean; // true = wrap, false = no wrap
  showLineNumbers: boolean;
  showGutter: boolean;
  highlightActiveLine: boolean;
}

export interface LanguageOption {
  id: string;
  name: string;
  aceMode: string;
  extension: string;
}

export interface ThemeOption {
  id: string;
  name: string;
  aceTheme: string;
  isDark: boolean;
}

export interface CursorPosition {
  row: number;
  column: number;
  totalLines: number;
  selectedTextLength: number;
}
