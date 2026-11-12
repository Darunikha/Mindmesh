import { useEffect } from 'react';
import { EditorContent, Extension, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import EditorToolbar from './EditorToolbar.jsx';

/** Mod+K opens the toolbar's link editor. */
const LinkShortcut = Extension.create({
  name: 'mmLinkShortcut',
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        this.editor.emit('mm:link');
        return true;
      },
    };
  },
});

/**
 * TipTap editor. StarterKit (v3) bundles headings, lists, blockquote, code blocks,
 * bold/italic/underline/strike, links and undo/redo history.
 * Content is exchanged as ProseMirror JSON, which the server validates and indexes.
 */
export default function RichTextEditor({ content, onChange, onReady, editable = true, placeholder = 'Start writing…' }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
          protocols: ['http', 'https', 'mailto'],
          isAllowedUri: (url, ctx) => /^(https?:|mailto:)/i.test(url) && ctx.defaultValidate(url),
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
      LinkShortcut,
    ],
    content,
    editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: 'mm-prose min-h-[50vh] px-5 py-6 outline-none sm:px-10 sm:py-8',
        'aria-label': 'Note content',
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON()),
  });

  useEffect(() => {
    if (editor) onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;
  return (
    <div className="flex flex-col">
      {editable && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
