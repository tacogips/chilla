import { describe, expect, it } from "vitest";
import { relativeTargetPath } from "./relative-target-path";

describe("relativeTargetPath", () => {
  it.each([
    ["/workspace", "/workspace/notes.md", "notes.md"],
    ["/workspace", "/workspace/archive/notes.md", "archive/notes.md"],
    ["/workspace/docs", "/workspace/notes.md", "../notes.md"],
    ["/workspace/docs", "/workspace", ".."],
    ["/workspace", "/workspace", "."],
    ["/workspace/", "/workspace/notes.md", "notes.md"],
    ["/", "/notes.md", "notes.md"],
    ["/workspace", "/", ".."],
    ["/", "/", "."],
    ["/work", "/workspace/notes.md", "../workspace/notes.md"],
    ["/workspace", "/workspace/日本語 notes.md", "日本語 notes.md"],
    ["/workspace", "/workspace/a\\b.md", "a\\b.md"],
    ["C:\\workspace", "C:\\workspace\\notes.md", "notes.md"],
    ["C:/workspace/docs", "c:/workspace/notes.md", "../notes.md"],
    ["C:/workspace", "D:/notes.md", "D:/notes.md"],
    ["/workspace", "C:/notes.md", "C:/notes.md"],
    ["", "/workspace/notes.md", "/workspace/notes.md"],
    ["workspace", "/workspace/notes.md", "/workspace/notes.md"],
    ["/workspace", "notes.md", "notes.md"],
    ["//server/share", "//other/share/notes.md", "//other/share/notes.md"],
  ])("formats %s to %s as %s", (directory, target, expected) => {
    expect(relativeTargetPath(directory, target)).toBe(expected);
  });
});
