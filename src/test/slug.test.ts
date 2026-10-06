import { describe, it, expect } from "vitest";
import {
  toSlug,
  getDeckFilename,
  getQuizFilename,
  getBulkExportFilename,
} from "@/lib/slug";

describe("toSlug", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(toSlug("Hello World")).toBe("hello-world");
  });

  it("replaces special characters with hyphens", () => {
    expect(toSlug("What is 5*3?")).toBe("what-is-5-3");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(toSlug("My  Deck!")).toBe("my-deck");
    expect(toSlug("a___b   c")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(toSlug("  Hello World  ")).toBe("hello-world");
    expect(toSlug("!!!edge!!!")).toBe("edge");
  });

  it("keeps digits", () => {
    expect(toSlug("Chapter 10")).toBe("chapter-10");
  });

  it("returns an empty string when nothing alphanumeric remains", () => {
    expect(toSlug("***")).toBe("");
    expect(toSlug("")).toBe("");
  });
});

describe("getDeckFilename", () => {
  it("slugifies the name and appends .json", () => {
    expect(getDeckFilename("My Deck")).toBe("my-deck.json");
  });

  it("falls back to 'deck' when the name slugifies to nothing", () => {
    expect(getDeckFilename("***")).toBe("deck.json");
  });
});

describe("getQuizFilename", () => {
  it("slugifies the name and appends .json", () => {
    expect(getQuizFilename("My Quiz")).toBe("my-quiz.json");
  });

  it("falls back to 'quiz' when the name slugifies to nothing", () => {
    expect(getQuizFilename("   ")).toBe("quiz.json");
  });
});

describe("getBulkExportFilename", () => {
  it("embeds today's date and uses the .zip extension", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(getBulkExportFilename()).toBe(`kioku-export-${today}.zip`);
  });
});
