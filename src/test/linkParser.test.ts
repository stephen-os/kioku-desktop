import { describe, it, expect } from "vitest";
import {
  parseLinks,
  extractLinkTitles,
  hasLinks,
  replaceLinks,
  createLink,
  escapeTitle,
  getPartialLink,
  filterSuggestions,
} from "@/lib/linkParser";

describe("parseLinks", () => {
  it("parses a plain [[Page]] link", () => {
    const [link] = parseLinks("see [[Ownership]] here");
    expect(link).toMatchObject({
      raw: "[[Ownership]]",
      title: "Ownership",
      display: "Ownership",
      start: 4,
      end: 17,
    });
  });

  it("parses pipe syntax, using the display text", () => {
    const [link] = parseLinks("[[Ownership|the owner]]");
    expect(link.title).toBe("Ownership");
    expect(link.display).toBe("the owner");
  });

  it("trims whitespace inside the brackets", () => {
    const [link] = parseLinks("[[  Spaced Title  |  Shown  ]]");
    expect(link.title).toBe("Spaced Title");
    expect(link.display).toBe("Shown");
  });

  it("reports accurate start/end offsets for multiple links", () => {
    const content = "a [[One]] b [[Two]]";
    const links = parseLinks(content);
    expect(links).toHaveLength(2);
    expect(content.slice(links[0].start, links[0].end)).toBe("[[One]]");
    expect(content.slice(links[1].start, links[1].end)).toBe("[[Two]]");
  });

  it("returns an empty array when there are no links", () => {
    expect(parseLinks("just plain text")).toEqual([]);
  });

  it("is re-runnable without leaking regex lastIndex state", () => {
    // Calling twice must yield identical results (guards the lastIndex reset).
    const content = "[[A]] and [[B]]";
    expect(parseLinks(content)).toEqual(parseLinks(content));
    expect(parseLinks(content)).toHaveLength(2);
  });

  it("does not match an empty title [[]]", () => {
    expect(parseLinks("[[]]")).toEqual([]);
  });
});

describe("extractLinkTitles", () => {
  it("returns unique titles in order of first appearance", () => {
    const titles = extractLinkTitles("[[A]] [[B]] [[A|again]] [[C]]");
    expect(titles).toEqual(["A", "B", "C"]);
  });

  it("returns an empty array for link-free content", () => {
    expect(extractLinkTitles("nothing")).toEqual([]);
  });
});

describe("hasLinks", () => {
  it("detects the presence of a link", () => {
    expect(hasLinks("x [[Y]] z")).toBe(true);
  });

  it("returns false when none present", () => {
    expect(hasLinks("no links")).toBe(false);
  });

  it("is stable across repeated calls", () => {
    expect(hasLinks("[[Y]]")).toBe(true);
    expect(hasLinks("[[Y]]")).toBe(true);
  });
});

describe("replaceLinks", () => {
  it("replaces each link while preserving surrounding text", () => {
    const result = replaceLinks(
      "go to [[Home]] then [[About]]",
      (link) => `<${link.title}>`
    );
    expect(result).toBe("go to <Home> then <About>");
  });

  it("uses the display text in the replacer", () => {
    const result = replaceLinks("[[Home|Start]]", (link) => link.display);
    expect(result).toBe("Start");
  });

  it("leaves content untouched when there are no links", () => {
    expect(replaceLinks("plain", () => "X")).toBe("plain");
  });

  it("handles replacements of differing length correctly (reverse order)", () => {
    const result = replaceLinks("[[A]]-[[B]]", () => "LONGER");
    expect(result).toBe("LONGER-LONGER");
  });
});

describe("createLink", () => {
  it("creates a plain link when no display text is given", () => {
    expect(createLink("Page")).toBe("[[Page]]");
  });

  it("creates a plain link when the display text equals the title", () => {
    expect(createLink("Page", "Page")).toBe("[[Page]]");
  });

  it("creates a piped link when display text differs", () => {
    expect(createLink("Page", "Shown")).toBe("[[Page|Shown]]");
  });
});

describe("escapeTitle", () => {
  it("strips brackets and pipes that would break link syntax", () => {
    expect(escapeTitle("a[b]c|d")).toBe("abcd");
  });

  it("leaves safe titles unchanged", () => {
    expect(escapeTitle("Normal Title")).toBe("Normal Title");
  });
});

describe("getPartialLink", () => {
  it("returns the partial query while typing inside [[", () => {
    const content = "text [[Own";
    expect(getPartialLink(content, content.length)).toBe("Own");
  });

  it("returns an empty string immediately after [[", () => {
    const content = "[[";
    expect(getPartialLink(content, content.length)).toBe("");
  });

  it("returns null when not inside an open link", () => {
    expect(getPartialLink("no brackets here", 5)).toBeNull();
  });

  it("returns null once the link has been closed", () => {
    const content = "[[Done]] more";
    expect(getPartialLink(content, content.length)).toBeNull();
  });

  it("returns the text after the pipe when using display syntax", () => {
    const content = "[[Page|dis";
    expect(getPartialLink(content, content.length)).toBe("dis");
  });

  it("does not treat a link as open across a newline", () => {
    const content = "[[Open\nnext line";
    expect(getPartialLink(content, content.length)).toBeNull();
  });

  it("uses the cursor position, ignoring text after the cursor", () => {
    const content = "[[Own] trailing";
    // Cursor sits right after "Own"; the later "]" is beyond the cursor.
    expect(getPartialLink(content, 5)).toBe("Own");
  });
});

describe("filterSuggestions", () => {
  const pages = [
    { id: "1", title: "Rust Basics", notebookId: "nb1" },
    { id: "2", title: "Advanced Rust", notebookId: "nb1" },
    { id: "3", title: "Go Basics", notebookId: "nb1" },
    { id: "4", title: "rust patterns", notebookId: "nb1" },
  ];

  it("returns all pages (minus excluded) for an empty query", () => {
    const result = filterSuggestions(pages, "", "1");
    expect(result.map((p) => p.id)).toEqual(["2", "3", "4"]);
  });

  it("filters case-insensitively by substring", () => {
    const result = filterSuggestions(pages, "basics");
    expect(result.map((p) => p.title)).toEqual(["Go Basics", "Rust Basics"]);
  });

  it("prioritizes titles that start with the query", () => {
    const result = filterSuggestions(pages, "rust");
    // "Rust Basics" and "rust patterns" start with the query (sorted A-Z),
    // then substring matches like "Advanced Rust".
    expect(result.map((p) => p.title)).toEqual([
      "Rust Basics",
      "rust patterns",
      "Advanced Rust",
    ]);
  });

  it("excludes the given page id", () => {
    const result = filterSuggestions(pages, "rust", "2");
    expect(result.some((p) => p.id === "2")).toBe(false);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterSuggestions(pages, "python")).toEqual([]);
  });

  it("caps results at 10", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      title: `Item ${i}`,
      notebookId: "nb1",
    }));
    expect(filterSuggestions(many, "item")).toHaveLength(10);
    expect(filterSuggestions(many, "")).toHaveLength(10);
  });
});
