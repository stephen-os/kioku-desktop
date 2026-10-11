import { useEffect, useMemo, useRef, useState } from "react";
import { PartialBlock, BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { createReactInlineContentSpec, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import "./blocknote-kioku.css";
import { parseLinks } from "@/lib/linkParser";

interface BlockNoteEditorProps {
  initialContent: string; // JSON string of blocks, markdown, or empty
  onChange: (content: string) => void;
  onSave?: () => void;
  editable?: boolean; // false => read-only (course note reference content)
  /** Clicking a [[wiki link]] calls this with the target page title. */
  onWikiLink?: (title: string) => void;
}

// The active wikilink click handler, shared with the module-scope inline-content
// render (only one notes editor is mounted at a time).
const wikiClick: { current: ((title: string) => void) | null } = { current: null };

// Custom inline content for [[wiki links]]. Rendered as a <span> (not an <a>),
// so Tauri never opens the browser and BlockNote shows no link toolbar; a plain
// left-click navigates in-app, with a pointer cursor.
const WikiLink = createReactInlineContentSpec(
  {
    type: "wikilink",
    propSchema: {
      target: { default: "" },
      display: { default: "" },
    },
    content: "none",
  } as const,
  {
    render: ({ inlineContent }) => {
      const target = String(inlineContent.props.target ?? "");
      const display = String(inlineContent.props.display ?? "") || target;
      return (
        <span
          className="wikilink"
          contentEditable={false}
          style={{ color: "#78dce8", textDecoration: "underline", textUnderlineOffset: "2px", cursor: "pointer" }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (target) wikiClick.current?.(target);
          }}
        >
          {display}
        </span>
      );
    },
  }
);

const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    wikilink: WikiLink,
  },
});

// Split a text run on [[Title]] / [[Title|Display]], returning a mixed array of
// text and wikilink inline content. Returns null if there's nothing to convert.
function splitTextForWikiLinks(text: string, styles: unknown): unknown[] | null {
  if (!text.includes("[[")) return null;
  const links = parseLinks(text);
  if (links.length === 0) return null;

  const out: unknown[] = [];
  let cursor = 0;
  for (const l of links) {
    if (l.start > cursor) {
      out.push({ type: "text", text: text.slice(cursor, l.start), styles: styles ?? {} });
    }
    out.push({ type: "wikilink", props: { target: l.title, display: l.display } });
    cursor = l.end;
  }
  if (cursor < text.length) {
    out.push({ type: "text", text: text.slice(cursor), styles: styles ?? {} });
  }
  return out;
}

// Recursively convert [[links]] in a block tree's inline content. Returns the
// (possibly new) blocks and whether anything changed.
function convertBlocks(blocks: any[]): { blocks: any[]; changed: boolean } {
  let changed = false;
  const out = blocks.map((block) => {
    let next = block;
    if (Array.isArray(block.content)) {
      let contentChanged = false;
      const newContent: unknown[] = [];
      for (const item of block.content) {
        if (item && item.type === "text" && typeof item.text === "string") {
          const split = splitTextForWikiLinks(item.text, item.styles);
          if (split) {
            contentChanged = true;
            newContent.push(...split);
            continue;
          }
        }
        newContent.push(item);
      }
      if (contentChanged) {
        changed = true;
        next = { ...next, content: newContent };
      }
    }
    if (Array.isArray(block.children) && block.children.length > 0) {
      const childResult = convertBlocks(block.children);
      if (childResult.changed) {
        changed = true;
        next = { ...next, children: childResult.blocks };
      }
    }
    return next;
  });
  return { blocks: out, changed };
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
  const [isReady, setIsReady] = useState(false);
  const wikiConvertedRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    wikiClick.current = onWikiLink ?? null;
    return () => {
      if (wikiClick.current === onWikiLink) wikiClick.current = null;
    };
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

  // Create editor with the wikilink schema + highlighted code blocks + images.
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialBlocks,
    codeBlock: codeBlockOptions,
    uploadFile: async (file: File) => {
      try {
        const dataUrl = await fileToDataUrl(file);
        return dataUrl;
      } catch (error) {
        console.error("Failed to process image:", error);
        throw error;
      }
    },
  });

  // Turn [[links]] in the current document into wikilink inline content, saving
  // the converted blocks. Runs once; no-ops when there's nothing to convert.
  const convertWikiLinks = () => {
    const { blocks, changed } = convertBlocks(editor.document as any[]);
    if (changed) {
      editor.replaceBlocks(editor.document, blocks as PartialBlock[]);
      onChangeRef.current(JSON.stringify(editor.document));
    }
  };

  // Convert legacy markdown content, then its [[links]], after editor is ready.
  useEffect(() => {
    if (!editor || !hasMarkdown || isReady) return;

    const convertMarkdown = async () => {
      try {
        const parsed = await editor.tryParseMarkdownToBlocks(initialContent);
        const { blocks } = convertBlocks(parsed as any[]);
        editor.replaceBlocks(editor.document, blocks as PartialBlock[]);
        onChangeRef.current(JSON.stringify(editor.document));
        wikiConvertedRef.current = true;
      } catch (error) {
        console.error("Failed to convert markdown:", error);
      }
      setIsReady(true);
    };

    convertMarkdown();
  }, [editor, hasMarkdown, initialContent, isReady]);

  // Convert [[links]] in already-JSON content (not markdown) once on mount.
  useEffect(() => {
    if (!editor || hasMarkdown || wikiConvertedRef.current) return;
    wikiConvertedRef.current = true;
    convertWikiLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, hasMarkdown]);

  // Handle content changes
  useEffect(() => {
    if (!editor) return;

    const handleChange = () => {
      const content = JSON.stringify(editor.document);
      onChangeRef.current(content);
    };

    editor.onEditorContentChange(handleChange);
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

  return (
    <div className="blocknote-editor-wrapper h-full overflow-auto">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="dark"
        data-theming-css-variables-demo
      />
    </div>
  );
}
