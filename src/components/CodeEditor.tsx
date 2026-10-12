import { useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { monokai } from "@uiw/codemirror-theme-monokai";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { sql } from "@codemirror/lang-sql";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { clojure } from "@codemirror/legacy-modes/mode/clojure";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import type { CodeLanguage } from "@/types";

function getLanguageExtension(language: CodeLanguage | null | undefined) {
  switch (language) {
    case "JAVASCRIPT":
      return javascript();
    case "TYPESCRIPT":
      return javascript({ typescript: true });
    case "PYTHON":
      return python();
    case "JAVA":
      return java();
    case "C":
    case "CPP":
      return cpp();
    case "RUST":
      return rust();
    case "GO":
      return go();
    case "SQL":
    case "GRAPHQL":
      return sql();
    case "HTML":
      return html();
    case "CSS":
      return css();
    case "JSON":
      return json();
    case "XML":
      return xml();
    case "MARKDOWN":
      return markdown();
    case "PHP":
      return php();
    case "YAML":
      return yaml();
    case "RUBY":
      return StreamLanguage.define(ruby);
    case "PERL":
      return StreamLanguage.define(perl);
    case "SWIFT":
    case "DART":
      return StreamLanguage.define(swift);
    case "HASKELL":
    case "FSHARP":
      return StreamLanguage.define(haskell);
    case "CLOJURE":
    case "ELIXIR":
      return StreamLanguage.define(clojure);
    case "BASH":
      return StreamLanguage.define(shell);
    case "POWERSHELL":
      return StreamLanguage.define(powerShell);
    case "DOCKER":
      return StreamLanguage.define(dockerFile);
    case "TOML":
      return StreamLanguage.define(toml);
    // Languages without CodeMirror support - no highlighting is better than wrong highlighting
    case "CSHARP":
    case "KOTLIN":
    case "SCALA":
    case "R":
    case "REGEX":
    case "PLAINTEXT":
    default:
      return [];
  }
}

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: CodeLanguage | null;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
}

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  className = "",
  minHeight = "120px",
}: CodeEditorProps) {
  const handleChange = useCallback(
    (val: string) => {
      if (onChange) {
        onChange(val);
      }
    },
    [onChange]
  );

  const langExt = getLanguageExtension(language);
  const extensions = [
    EditorView.lineWrapping,
    ...(Array.isArray(langExt) ? langExt : [langExt]),
  ];

  if (readOnly) {
    extensions.push(EditorState.readOnly.of(true));
    extensions.push(EditorView.editable.of(false));
  }

  return (
    <div className={`rounded-lg overflow-hidden border border-[#49483e] ${className}`}>
      <CodeMirror
        value={value}
        height={minHeight}
        theme={monokai}
        extensions={extensions}
        onChange={handleChange}
        editable={!readOnly}
        basicSetup={{
          lineNumbers: !readOnly,
          highlightActiveLineGutter: !readOnly,
          highlightActiveLine: !readOnly,
          foldGutter: false,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: !readOnly,
          autocompletion: false,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
        }}
      />
    </div>
  );
}

// Read-only code display component
export function CodeBlock({
  code,
  language,
  className = "",
}: {
  code: string;
  language?: CodeLanguage | null;
  className?: string;
}) {
  return (
    <CodeEditor
      value={code}
      language={language}
      readOnly={true}
      className={className}
      minHeight="auto"
    />
  );
}
