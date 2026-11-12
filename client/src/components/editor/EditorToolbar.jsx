import { useEffect, useRef, useState } from 'react';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { cn } from '../../lib/cn.js';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl+';

function ToolButton({ icon: Icon, label, shortcut, active, disabled, onClick }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors disabled:opacity-35',
        'hover:bg-sunken hover:text-ink',
        active && 'bg-accent-soft !text-accent'
      )}
    >
      <Icon size={16} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px shrink-0 bg-line-strong" aria-hidden />;

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function LinkEditor({ editor, onDone }) {
  const current = editor.getAttributes('link').href || '';
  const [href, setHref] = useState(current);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const apply = (e) => {
    e.preventDefault();
    const value = href.trim();
    if (!value) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return onDone();
    }
    const url = SAFE_URL.test(value) ? value : `https://${value}`;
    try {
      new URL(url);
    } catch {
      setError('Enter a valid URL');
      return undefined;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    return onDone();
  };

  return (
    <form onSubmit={apply} className="flex flex-1 items-center gap-2 px-1" onKeyDown={(e) => e.key === 'Escape' && onDone()}>
      <label htmlFor="link-href" className="sr-only">
        Link URL
      </label>
      <input
        ref={inputRef}
        id="link-href"
        value={href}
        onChange={(e) => {
          setHref(e.target.value);
          setError(null);
        }}
        placeholder="https://…"
        className="mm-input !min-h-8 !py-1 text-sm"
        aria-invalid={error ? 'true' : undefined}
      />
      <button type="submit" className="mm-btn mm-btn-primary mm-btn-sm">
        {current ? 'Update' : 'Add link'}
      </button>
      {current && (
        <button
          type="button"
          className="mm-btn mm-btn-ghost mm-btn-sm"
          onClick={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            onDone();
          }}
        >
          Remove
        </button>
      )}
      <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={onDone}>
        Cancel
      </button>
      {error && <span className="font-ui text-xs text-danger">{error}</span>}
    </form>
  );
}

/** Formatting toolbar. State is read through useEditorState so it re-renders only when it changes. */
export default function EditorToolbar({ editor }) {
  const [linkMode, setLinkMode] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      paragraph: e.isActive('paragraph'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  useEffect(() => {
    const open = () => setLinkMode(true);
    editor.on('mm:link', open);
    return () => editor.off('mm:link', open);
  }, [editor]);

  const c = () => editor.chain().focus();

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        'sticky top-0 z-20 flex min-h-11 items-center gap-0.5 overflow-x-auto border-b border-line px-2 py-1.5',
        'library:bg-surface-2/95 studio:rounded-t-[20px] studio:bg-surface/95 lab:bg-bg-elev/95 backdrop-blur'
      )}
    >
      {linkMode ? (
        <LinkEditor editor={editor} onDone={() => setLinkMode(false)} />
      ) : (
        <>
          <ToolButton icon={Undo2} label="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => c().undo().run()} />
          <ToolButton icon={Redo2} label="Redo" shortcut={isMac ? '⇧⌘Z' : 'Ctrl+Y'} disabled={!s.canRedo} onClick={() => c().redo().run()} />
          <Divider />
          <ToolButton icon={Pilcrow} label="Paragraph" active={s.paragraph && !s.bullet && !s.ordered && !s.quote} onClick={() => c().setParagraph().run()} />
          <ToolButton icon={Heading1} label="Heading 1" active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()} />
          <ToolButton icon={Heading2} label="Heading 2" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
          <ToolButton icon={Heading3} label="Heading 3" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
          <Divider />
          <ToolButton icon={Bold} label="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => c().toggleBold().run()} />
          <ToolButton icon={Italic} label="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => c().toggleItalic().run()} />
          <ToolButton icon={Underline} label="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => c().toggleUnderline().run()} />
          <ToolButton icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()} />
          <ToolButton icon={Code} label="Inline code" active={s.code} onClick={() => c().toggleCode().run()} />
          <ToolButton icon={s.link ? Link2Off : Link2} label={s.link ? 'Edit link' : 'Add link'} shortcut={`${mod}K`} active={s.link} onClick={() => setLinkMode(true)} />
          <Divider />
          <ToolButton icon={List} label="Bullet list" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
          <ToolButton icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
          <ToolButton icon={Quote} label="Blockquote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
          <ToolButton icon={SquareCode} label="Code block" active={s.codeBlock} onClick={() => c().toggleCodeBlock().run()} />
          <ToolButton icon={Minus} label="Divider" onClick={() => c().setHorizontalRule().run()} />
        </>
      )}
    </div>
  );
}
