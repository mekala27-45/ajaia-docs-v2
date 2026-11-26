"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
} from "lucide-react";
import { cx } from "@/components/ui";

type BlockStyle = "p" | "h1" | "h2" | "h3";

function ToolButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      // Keep the text selection in the document when the button is pressed.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cx(
        "grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35",
        active ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-slate-200" />;

export function Toolbar({ editor }: { editor: Editor }) {
  // Re-render the toolbar only when one of these values changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const block: BlockStyle = current.isActive("heading", { level: 1 })
        ? "h1"
        : current.isActive("heading", { level: 2 })
          ? "h2"
          : current.isActive("heading", { level: 3 })
            ? "h3"
            : "p";
      return {
        block,
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  function setBlock(next: BlockStyle) {
    const chain = editor.chain().focus();
    if (next === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(next[1]) as 1 | 2 | 3 }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="mx-auto flex w-full max-w-6xl items-center gap-0.5 overflow-x-auto border-t border-slate-100 px-4 py-1.5"
    >
      <ToolButton label="Undo" shortcut="Ctrl+Z" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <select
        aria-label="Paragraph style"
        title="Paragraph style. Applies to the whole paragraph, like in Google Docs."
        data-testid="block-style"
        value={state.block}
        onChange={(event) => setBlock(event.target.value as BlockStyle)}
        className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <Divider />

      <ToolButton label="Bold" shortcut="Ctrl+B" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Italic" shortcut="Ctrl+I" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Underline" shortcut="Ctrl+U" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <Underline className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <ToolButton label="Bulleted list" active={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Numbered list" active={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Quote" active={state.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <TextQuote className="h-4 w-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        label="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}
