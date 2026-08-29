"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter,
  AlignRight, List, ListOrdered, Link as LinkIcon,
  Image as ImageIcon, Sparkles, ChevronDown, Type
} from "lucide-react";

interface RichTextEditorProps {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  defaultTermsFallback?: string;
}

// ── Markdown to Formatted HTML Converter ──────────────────────────────────────
export function markdownToHtml(md?: string): string {
  if (!md) return "";
  
  // If it already looks like HTML, return as-is
  if (/<[a-z][\s\S]*>/i.test(md)) {
    return md;
  }

  let html = md;

  // Replace horizontal rules
  html = html.replace(/^---$/gm, "<hr class='my-4 border-slate-200 dark:border-slate-800' />");

  // Headers # Header 1, ## Header 2
  html = html.replace(/^### (.*$)/gim, "<h4 class='font-bold text-sm text-[var(--text-primary)] mt-3 mb-1'>$1</h4>");
  html = html.replace(/^## (.*$)/gim, "<h3 class='font-bold text-base text-[var(--text-primary)] mt-3.5 mb-1'>$1</h3>");
  html = html.replace(/^# (.*$)/gim, "<h2 class='font-black text-lg text-[var(--text-primary)] mt-4 mb-1.5'>$1</h2>");

  // Bold **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/gim, "<strong>$1</strong>");

  // Italic *text* or _text_
  html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");
  html = html.replace(/_(.*?)_/gim, "<em>$1</em>");

  // Bullet Lists (* item or - item)
  const lines = html.split("\n");
  let inList = false;
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("* ") || line.startsWith("- ")) {
      if (!inList) {
        processedLines.push("<ul class='list-disc pl-5 my-2 space-y-1'>");
        inList = true;
      }
      processedLines.push(`<li>${line.substring(2)}</li>`);
    } else {
      if (inList) {
        processedLines.push("</ul>");
        inList = false;
      }
      if (line.length > 0 && !line.startsWith("<h") && !line.startsWith("<hr")) {
        processedLines.push(`<p class='my-1.5 leading-relaxed text-[var(--text-primary)]'>${line}</p>`);
      } else {
        processedLines.push(line);
      }
    }
  }
  if (inList) {
    processedLines.push("</ul>");
  }

  return processedLines.join("\n");
}

export function RichTextEditor({
  value = "",
  onChange,
  placeholder = "Write terms, conditions, or event guidelines...",
  maxLength = 2000,
  className = "",
  defaultTermsFallback = "",
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [fontFamily, setFontFamily] = useState("Inter");
  const [fontSize, setFontSize] = useState("16px");
  const [charCount, setCharCount] = useState(0);
  const [color, setColor] = useState("#0f172a");
  const isInternalUpdate = useRef(false);

  // Initialize and populate content
  useEffect(() => {
    if (!editorRef.current) return;
    
    // Convert incoming markdown to formatted HTML
    const initialText = value || defaultTermsFallback || "";
    const formattedHtml = markdownToHtml(initialText);
    
    if (editorRef.current.innerHTML !== formattedHtml && !isInternalUpdate.current) {
      editorRef.current.innerHTML = formattedHtml;
      updateCharCount();
    }
  }, [value, defaultTermsFallback]);

  const updateCharCount = () => {
    if (editorRef.current) {
      const text = editorRef.current.innerText || "";
      setCharCount(text.trim().length);
    }
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    updateCharCount();
    if (onChange) {
      onChange(html);
    }
    setTimeout(() => {
      isInternalUpdate.current = false;
    }, 50);
  };

  const executeCommand = (cmd: string, val: string | undefined = undefined) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      editorRef.current.focus();
      handleInput();
    }
  };

  const handleFontFamilyChange = (font: string) => {
    setFontFamily(font);
    if (editorRef.current) {
      editorRef.current.style.fontFamily = font;
    }
    executeCommand("fontName", font);
  };

  const handleFontSizeChange = (size: string) => {
    setFontSize(size);
    if (editorRef.current) {
      editorRef.current.style.fontSize = size;
    }
  };

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    executeCommand("foreColor", newColor);
  };

  const handleInsertLink = () => {
    const url = prompt("Enter URL:", "https://");
    if (url) {
      executeCommand("createLink", url);
    }
  };

  const handleSparklesFormat = () => {
    executeCommand("removeFormat");
  };

  const remaining = Math.max(0, maxLength - charCount);

  return (
    <div className={`space-y-2 select-none ${className}`}>
      {/* ── TOP TOOLBAR ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface-2)] text-xs text-[var(--text-primary)]">
        {/* Font Family Dropdown */}
        <div className="relative inline-flex items-center">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] text-xs font-semibold hover:border-[var(--pri)]/40 transition-colors">
            <Type className="size-3.5 text-[var(--text-secondary)]" />
            <select
              value={fontFamily}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1 font-semibold text-xs"
            >
              <option value="Inter">Inter</option>
              <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
              <option value="Geist">Geist</option>
              <option value="Outfit">Outfit</option>
              <option value="Roboto">Roboto</option>
              <option value="Arial">Arial</option>
            </select>
          </div>
        </div>

        {/* Font Size Dropdown */}
        <div className="relative inline-flex items-center">
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] text-xs font-semibold hover:border-[var(--pri)]/40 transition-colors">
            <select
              value={fontSize}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer pr-1 font-semibold text-xs"
            >
              <option value="12px">12px</option>
              <option value="14px">14px</option>
              <option value="16px">16px</option>
              <option value="18px">18px</option>
              <option value="20px">20px</option>
            </select>
          </div>
        </div>

        {/* Divider */}
        <div className="h-5 w-[1px] bg-[var(--border-default)] mx-0.5" />

        {/* Bold */}
        <button
          type="button"
          onClick={() => executeCommand("bold")}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] font-bold transition-colors cursor-pointer"
          title="Bold (Ctrl+B)"
        >
          <Bold className="size-3.5 sm:size-4" />
        </button>

        {/* Italic */}
        <button
          type="button"
          onClick={() => executeCommand("italic")}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Italic (Ctrl+I)"
        >
          <Italic className="size-3.5 sm:size-4" />
        </button>

        {/* Underline */}
        <button
          type="button"
          onClick={() => executeCommand("underline")}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Underline (Ctrl+U)"
        >
          <Underline className="size-3.5 sm:size-4" />
        </button>

        {/* Color Dot Button */}
        <div className="relative inline-flex items-center">
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
            className="sr-only"
            id="textColorPicker"
          />
          <label
            htmlFor="textColorPicker"
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-hover)] cursor-pointer flex items-center justify-center"
            title="Text Color"
          >
            <span
              className="size-3.5 rounded-full border border-black/20 shadow-sm"
              style={{ backgroundColor: color }}
            />
          </label>
        </div>

        {/* Divider */}
        <div className="h-5 w-[1px] bg-[var(--border-default)] mx-0.5" />

        {/* Align Left */}
        <button
          type="button"
          onClick={() => executeCommand("justifyLeft")}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Align Left"
        >
          <AlignLeft className="size-3.5 sm:size-4" />
        </button>

        {/* Align Center */}
        <button
          type="button"
          onClick={() => executeCommand("justifyCenter")}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Align Center"
        >
          <AlignCenter className="size-3.5 sm:size-4" />
        </button>

        {/* Bullet List */}
        <button
          type="button"
          onClick={() => executeCommand("insertUnorderedList")}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Bulleted List"
        >
          <List className="size-3.5 sm:size-4" />
        </button>

        {/* Link */}
        <button
          type="button"
          onClick={handleInsertLink}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
          title="Insert Link"
        >
          <LinkIcon className="size-3.5 sm:size-4" />
        </button>

        {/* Clear / Sparkles Format */}
        <button
          type="button"
          onClick={handleSparklesFormat}
          className="p-1.5 sm:p-2 rounded-lg hover:bg-[var(--bg-surface-hover)] text-[var(--pri)] transition-colors cursor-pointer ml-auto"
          title="Clean Formatting"
        >
          <Sparkles className="size-3.5 sm:size-4" />
        </button>
      </div>

      {/* ── CONTENTEDITABLE EDITOR CONTAINER ───────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-base)] p-4 sm:p-5 focus-within:ring-2 focus-within:ring-[var(--pri)]/20 focus-within:border-[var(--pri)] transition-all shadow-sm">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={handleInput}
          data-placeholder={placeholder}
          className="min-h-[160px] sm:min-h-[200px] max-h-[400px] overflow-y-auto focus:outline-none leading-relaxed text-[var(--text-primary)] text-sm prose dark:prose-invert max-w-none"
          style={{ fontFamily, fontSize }}
        />
      </div>

      {/* ── BOTTOM CHARACTER COUNT ─────────────────────────────────────────── */}
      <div className="text-right text-[11px] font-medium text-[var(--text-secondary)] px-1">
        <span>{remaining} characters left</span>
      </div>
    </div>
  );
}
