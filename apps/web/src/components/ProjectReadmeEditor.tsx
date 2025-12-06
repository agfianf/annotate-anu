/**
 * Project README Editor Component
 * Rich markdown editor using MDX Editor for project documentation
 * Supports three modes: Rich Text (default), Raw Markdown, Preview
 */

import {
    AdmonitionDirectiveDescriptor,
    BlockTypeSelect,
    BoldItalicUnderlineToggles,
    codeBlockPlugin,
    codeMirrorPlugin,
    CodeToggle,
    CreateLink,
    diffSourcePlugin,
    directivesPlugin,
    headingsPlugin,
    imagePlugin,
    InsertAdmonition,
    InsertCodeBlock,
    InsertImage,
    InsertTable,
    InsertThematicBreak,
    linkDialogPlugin,
    linkPlugin,
    listsPlugin,
    ListsToggle,
    markdownShortcutPlugin,
    MDXEditor,
    type MDXEditorMethods,
    quotePlugin,
    Separator,
    StrikeThroughSupSubToggles,
    tablePlugin,
    thematicBreakPlugin,
    toolbarPlugin,
    UndoRedo
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { Code2, Eye, Type } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type EditorMode = 'richtext' | 'raw' | 'preview';

interface ProjectReadmeEditorProps {
  markdown: string;
  onChange?: (markdown: string) => void;
  isEditing?: boolean;
  placeholder?: string;
}

export interface ProjectReadmeEditorHandle {
  getMarkdown: () => string;
}

/**
 * Rich markdown editor for project README content with mode toggle
 */
const ProjectReadmeEditor = forwardRef<ProjectReadmeEditorHandle, ProjectReadmeEditorProps>(
  ({ markdown, onChange, isEditing = false, placeholder = 'Start writing project documentation...' }, ref) => {
    const [mode, setMode] = useState<EditorMode>('richtext');
    const [rawContent, setRawContent] = useState(markdown);
    const mdxEditorRef = useRef<MDXEditorMethods>(null);

    // Sync rawContent when markdown prop changes
    useEffect(() => {
      setRawContent(markdown);
    }, [markdown]);

    // Expose getMarkdown method to parent
    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (mode === 'raw') {
          return rawContent;
        }
        return mdxEditorRef.current?.getMarkdown() || rawContent;
      },
    }));

    // Handle mode change - sync content between modes
    const handleModeChange = (newMode: EditorMode) => {
      if (mode === 'richtext' && mdxEditorRef.current) {
        // Save content from rich text before switching
        const currentContent = mdxEditorRef.current.getMarkdown();
        setRawContent(currentContent);
        onChange?.(currentContent);
      } else if (mode === 'raw') {
        // Sync raw content to onChange before switching
        onChange?.(rawContent);
      }
      setMode(newMode);
    };

    // Handle raw content change
    const handleRawChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setRawContent(e.target.value);
      onChange?.(e.target.value);
    };

    const modeButtons = [
      { mode: 'richtext' as EditorMode, icon: Type, label: 'Rich Text' },
      { mode: 'raw' as EditorMode, icon: Code2, label: 'Raw' },
      { mode: 'preview' as EditorMode, icon: Eye, label: 'Preview' },
    ];

    // All plugins for the editor
    const allPlugins = [
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      imagePlugin({
        imageUploadHandler: async () => {
          // For now, just return a placeholder - can be extended later
          return 'https://via.placeholder.com/400x300';
        },
        imageAutocompleteSuggestions: [
          'https://via.placeholder.com/400x300',
          'https://via.placeholder.com/800x600',
        ],
      }),
      codeBlockPlugin({ defaultCodeBlockLanguage: 'python' }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          python: 'Python',
          javascript: 'JavaScript',
          typescript: 'TypeScript',
          css: 'CSS',
          html: 'HTML',
          json: 'JSON',
          yaml: 'YAML',
          bash: 'Bash',
          sql: 'SQL',
          markdown: 'Markdown',
        },
      }),
      directivesPlugin({
        directiveDescriptors: [AdmonitionDirectiveDescriptor],
      }),
      diffSourcePlugin({ viewMode: 'rich-text' }),
      markdownShortcutPlugin(),
    ];

    // Toolbar for editing mode
    const editingPlugins = [
      ...allPlugins,
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <BoldItalicUnderlineToggles />
            <StrikeThroughSupSubToggles />
            <CodeToggle />
            <Separator />
            <ListsToggle />
            <Separator />
            <CreateLink />
            <InsertImage />
            <Separator />
            <InsertTable />
            <InsertThematicBreak />
            <Separator />
            <InsertCodeBlock />
            <InsertAdmonition />
          </>
        ),
      }),
    ];

    return (
      <div className="readme-editor-wrapper">
        {/* Mode Toggle - Only show when editing */}
        {isEditing && (
          <div className="mode-toggle-bar">
            <div className="mode-toggle-group">
              {modeButtons.map(({ mode: m, icon: Icon, label }) => (
                <button
                  key={m}
                  onClick={() => handleModeChange(m)}
                  className={`mode-toggle-btn ${mode === m ? 'active' : ''}`}
                  title={label}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rich Text Mode */}
        {mode === 'richtext' && isEditing && (
          <MDXEditor
            ref={mdxEditorRef}
            markdown={rawContent}
            onChange={(value) => {
              setRawContent(value);
              onChange?.(value);
            }}
            placeholder={placeholder}
            contentEditableClassName="prose prose-emerald max-w-none min-h-[400px] p-4 focus:outline-none"
            plugins={editingPlugins}
          />
        )}

        {/* Raw Markdown Mode */}
        {mode === 'raw' && isEditing && (
          <textarea
            value={rawContent}
            onChange={handleRawChange}
            placeholder={placeholder}
            className="raw-editor"
            spellCheck={false}
          />
        )}

        {/* Preview Mode (also used for non-editing view) */}
        {(mode === 'preview' || !isEditing) && (
          <MDXEditor
            markdown={rawContent}
            readOnly={true}
            contentEditableClassName="prose prose-emerald max-w-none min-h-[300px] p-4"
            plugins={allPlugins}
          />
        )}

        <style>{`
          .readme-editor-wrapper {
            border: 1px solid #e5e7eb;
            border-radius: 0.75rem;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.8);
          }
          
          .mode-toggle-bar {
            background: linear-gradient(to bottom, #f9fafb, #f3f4f6);
            border-bottom: 1px solid #e5e7eb;
            padding: 0.5rem 0.75rem;
            display: flex;
            align-items: center;
            justify-content: flex-start;
          }
          
          .mode-toggle-group {
            display: flex;
            gap: 0.25rem;
            background: #e5e7eb;
            padding: 0.25rem;
            border-radius: 0.5rem;
          }
          
          .mode-toggle-btn {
            display: flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.375rem 0.75rem;
            font-size: 0.8125rem;
            font-weight: 500;
            color: #6b7280;
            background: transparent;
            border: none;
            border-radius: 0.375rem;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          
          .mode-toggle-btn:hover {
            color: #374151;
            background: rgba(255, 255, 255, 0.5);
          }
          
          .mode-toggle-btn.active {
            color: #059669;
            background: white;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          }
          
          .raw-editor {
            width: 100%;
            min-height: 400px;
            padding: 1rem;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.875rem;
            line-height: 1.6;
            color: #1f2937;
            background: #fafafa;
            border: none;
            outline: none;
            resize: vertical;
          }
          
          .raw-editor::placeholder {
            color: #9ca3af;
          }
          
          /* Toolbar styling */
          .readme-editor-wrapper [class*="_toolbarRoot"] {
            background: linear-gradient(to bottom, #f9fafb, #f3f4f6);
            border-bottom: 1px solid #e5e7eb;
            padding: 0.5rem;
            gap: 0.25rem;
            flex-wrap: wrap;
          }
          
          .readme-editor-wrapper [class*="_toolbarRoot"] button {
            border-radius: 0.375rem;
            transition: all 0.15s ease;
          }
          
          .readme-editor-wrapper [class*="_toolbarRoot"] button:hover {
            background: #10b981;
            color: white;
          }
          
          .readme-editor-wrapper [class*="_toolbarRoot"] button[data-active="true"] {
            background: #059669;
            color: white;
          }
          
          /* Separator styling */
          .readme-editor-wrapper [class*="_toolbarRoot"] [class*="_separator"] {
            background: #e5e7eb;
            width: 1px;
            height: 1.5rem;
            margin: 0 0.25rem;
          }
          
          /* Dropdown styling */
          .readme-editor-wrapper select {
            border-radius: 0.375rem;
            border: 1px solid #e5e7eb;
            padding: 0.25rem 0.5rem;
            font-size: 0.8125rem;
            background: white;
          }
          
          .readme-editor-wrapper .prose {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 1rem;
            color: #374151;
            line-height: 1.75;
            letter-spacing: -0.01em;
          }
          
          .readme-editor-wrapper .prose h1 {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 2rem;
            font-weight: 700;
            color: #064e3b;
            margin-bottom: 1.25rem;
            border-bottom: 2px solid #10b981;
            padding-bottom: 0.75rem;
            letter-spacing: -0.02em;
            line-height: 1.25;
          }
          
          .readme-editor-wrapper .prose h2 {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 1.5rem;
            font-weight: 600;
            color: #065f46;
            margin-top: 2rem;
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
            line-height: 1.3;
            border-left: 3px solid #10b981;
            padding-left: 0.75rem;
          }
          
          .readme-editor-wrapper .prose h3 {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 1.25rem;
            font-weight: 600;
            color: #047857;
            margin-top: 1.75rem;
            margin-bottom: 0.75rem;
            letter-spacing: -0.01em;
            line-height: 1.4;
          }
          
          .readme-editor-wrapper .prose h4 {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 1.125rem;
            font-weight: 600;
            color: #059669;
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            line-height: 1.4;
          }
          
          .readme-editor-wrapper .prose p {
            margin-bottom: 1.25rem;
            line-height: 1.75;
          }
          
          .readme-editor-wrapper .prose ul,
          .readme-editor-wrapper .prose ol {
            margin-left: 1.5rem;
            margin-bottom: 1rem;
          }
          
          .readme-editor-wrapper .prose li {
            margin-bottom: 0.375rem;
            line-height: 1.7;
          }
          
          .readme-editor-wrapper .prose a {
            color: #10b981;
            text-decoration: underline;
            text-decoration-color: #6ee7b7;
            text-underline-offset: 2px;
          }
          
          .readme-editor-wrapper .prose a:hover {
            color: #059669;
            text-decoration-color: #10b981;
          }
          
          .readme-editor-wrapper .prose blockquote {
            border-left: 4px solid #10b981;
            padding-left: 1rem;
            color: #6b7280;
            font-style: italic;
            margin: 1rem 0;
            background: rgba(16, 185, 129, 0.05);
            padding: 0.75rem 1rem;
            border-radius: 0 0.5rem 0.5rem 0;
          }
          
          .readme-editor-wrapper .prose code {
            background: #f3f4f6;
            padding: 0.125rem 0.375rem;
            border-radius: 0.25rem;
            font-size: 0.875rem;
            color: #d946ef;
          }
          
          .readme-editor-wrapper .prose pre {
            background: #1f2937;
            border-radius: 0.5rem;
            padding: 1rem;
            overflow-x: auto;
            margin: 1rem 0;
          }
          
          .readme-editor-wrapper .prose pre code {
            background: transparent;
            color: #e5e7eb;
            padding: 0;
          }
          
          .readme-editor-wrapper .prose table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
          }
          
          .readme-editor-wrapper .prose th,
          .readme-editor-wrapper .prose td {
            border: 1px solid #e5e7eb;
            padding: 0.5rem 0.75rem;
            text-align: left;
          }
          
          .readme-editor-wrapper .prose th {
            background: #f9fafb;
            font-weight: 600;
          }
          
          .readme-editor-wrapper .prose hr {
            border: none;
            border-top: 2px solid #e5e7eb;
            margin: 1.5rem 0;
          }
          
          .readme-editor-wrapper .prose img {
            max-width: 100%;
            border-radius: 0.5rem;
            margin: 1rem 0;
          }
          
          /* Admonition styles */
          .readme-editor-wrapper .prose [class*="admonition"] {
            border-radius: 0.5rem;
            padding: 1rem;
            margin: 1rem 0;
            border-left: 4px solid;
          }
          
          .readme-editor-wrapper .prose [class*="note"] {
            background: rgba(59, 130, 246, 0.1);
            border-color: #3b82f6;
          }
          
          .readme-editor-wrapper .prose [class*="tip"] {
            background: rgba(16, 185, 129, 0.1);
            border-color: #10b981;
          }
          
          .readme-editor-wrapper .prose [class*="info"] {
            background: rgba(6, 182, 212, 0.1);
            border-color: #06b6d4;
          }
          
          .readme-editor-wrapper .prose [class*="caution"] {
            background: rgba(245, 158, 11, 0.1);
            border-color: #f59e0b;
          }
          
          .readme-editor-wrapper .prose [class*="danger"] {
            background: rgba(239, 68, 68, 0.1);
            border-color: #ef4444;
          }
          
          /* Strikethrough */
          .readme-editor-wrapper .prose s,
          .readme-editor-wrapper .prose del {
            text-decoration: line-through;
            color: #9ca3af;
          }
          
          /* Subscript and Superscript */
          .readme-editor-wrapper .prose sub {
            font-size: 0.75em;
            vertical-align: sub;
          }
          
          .readme-editor-wrapper .prose sup {
            font-size: 0.75em;
            vertical-align: super;
          }
          
          /* Read-only mode styling */
          .readme-editor-wrapper [contenteditable="false"] {
            cursor: default;
          }
          
          /* Placeholder styling */
          .readme-editor-wrapper [data-placeholder]::before {
            color: #9ca3af;
            font-style: italic;
          }
          
          /* CodeMirror styling */
          .readme-editor-wrapper .cm-editor {
            border-radius: 0.5rem;
            overflow: hidden;
          }
          
          .readme-editor-wrapper .cm-editor .cm-scroller {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          }
        `}</style>
      </div>
    );
  }
);

ProjectReadmeEditor.displayName = 'ProjectReadmeEditor';

export default ProjectReadmeEditor;
