import { useEffect, useMemo, useRef, useState } from "react";
import { PartialBlock } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./blocknote-kioku.css";
import { replaceLinks } from "@/lib/linkParser";

interface BlockNoteEditorProps {
  initialContent: string; // JSON string of blocks, markdown, or empty
  onChange: (content: string) => void;
  onSave?: () => void;
  editable?: boolean; // false => read-only (course note reference content)
  /** Clicking a [[wiki link]] calls this with the target page title. */
  onWikiLink?: (title: string) => void;
}

// Turn [[Title]] / [[Title|Display]] into markdown links whose href stays the
// literal [[Title]] — so BlockNote renders a clickable link while the stored
// content still contains [[Title]] for backlink matching.
function preprocessWikiLinks(markdown: string): string {
  return replaceLinks(markdown, (l) => `[${l.display}]([[${l.title}]])`);
}

// Check if content looks like JSON (BlockNote format)
function isJsonContent(content: string): boolean {
  if (!content || content.trim() === "") return false;
  const trimmed = content.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

// Convert file to data URL (keeps full data:image/xxx;base64,... format)
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


export function NotesBlockEditor({ initialContent, onChange, onSave, editable = true, onWikiLink }: BlockNoteEditorProps) {
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onWikiLinkRef = useRef(onWikiLink);
  const [isReady, setIsReady] = useState(false);

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    onWikiLinkRef.current = onWikiLink;
  }, [onChange, onSave, onWikiLink]);

  // Parse initial content - either JSON blocks or legacy markdown
  const { initialBlocks, hasMarkdown } = useMemo(() => {
    if (!initialContent || initialContent.trim() === "") {
      return { initialBlocks: undefined, hasMarkdown: false };
    }

    if (isJsonContent(initialContent)) {
      try {
        return {
          initialBlocks: JSON.parse(initialContent) as PartialBlock[],
          hasMarkdown: false,
        };
      } catch {
        return { initialBlocks: undefined, hasMarkdown: false };
      }
    }

    // Content is legacy markdown - will be converted after editor creation
    return { initialBlocks: undefined, hasMarkdown: true };
  }, [initialContent]);

  // Create editor with custom image upload handler
  const editor = useCreateBlockNote({
    initialContent: initialBlocks,
    // Syntax-highlighted code blocks (Shiki, precompiled langs — offline-safe).
    codeBlock: codeBlockOptions,
    uploadFile: async (file: File) => {
      try {
        // Convert file to data URL and return directly
        // This embeds the image in the document as base64
        const dataUrl = await fileToDataUrl(file);
        return dataUrl;
      } catch (error) {
        console.error("Failed to process image:", error);
        throw error;
      }
    },
  });

  // Convert legacy markdown content after editor is ready
  useEffect(() => {
    if (!editor || !hasMarkdown || isReady) return;

    const convertMarkdown = async () => {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(preprocessWikiLinks(initialContent));
        editor.replaceBlocks(editor.document, blocks);
        // Trigger a save with the converted content
        const content = JSON.stringify(editor.document);
        onChangeRef.current(content);
      } catch (error) {
        console.error("Failed to convert markdown:", error);
      }
      setIsReady(true);
    };

    convertMarkdown();
  }, [editor, hasMarkdown, initialContent, isReady]);

  // Handle content changes
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      const content = JSON.stringify(editor.document);
      onChangeRef.current(content);
    };

    // Subscribe to changes
    editor.onEditorContentChange(handleChange);

    // Note: BlockNote doesn't have an unsubscribe, but the editor
    // will be destroyed when component unmounts
  }, [editor]);

  // Handle Ctrl+S for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onSaveRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Intercept clicks on [[wiki links]] (href kept as the literal "[[Title]]")
  // and route them to onWikiLink instead of letting the browser navigate.
  const handleClickCapture = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href") ?? "";
    if (href.startsWith("[[") && href.endsWith("]]")) {
      e.preventDefault();
      e.stopPropagation();
      const title = href.slice(2, -2).split("|")[0].trim();
      if (title) onWikiLinkRef.current?.(title);
    }
  };

  return (
    <div className="blocknote-editor-wrapper h-full overflow-auto" onClickCapture={handleClickCapture}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="dark"
        data-theming-css-variables-demo
      />
    </div>
  );
}
