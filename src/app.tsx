import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Toolbar } from './components/Toolbar';
import { useHashSync } from './hooks/useHashSync';
import { useSelectionToolbar } from './hooks/useSelectionToolbar';
import { parseMarkdown } from './lib/markdown';
import { selectAllContent, setCaretOffset } from './lib/selection';
import logoUrl from './assets/logo.svg';

export function App() {
    const [text, setText] = useState('');
    const textRef = useRef<string>('');
    const canvasRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        textRef.current = text;
        if (canvasRef.current && canvasRef.current.innerText !== text) {
            canvasRef.current.innerText = text;
        }
    }, [text]);

    const previewHtml = useMemo(() => parseMarkdown(text), [text]);
    const { tryLoadFromText, triggerSave } = useHashSync({ textRef, setText });
    const { toolbar, applyFormat } = useSelectionToolbar(canvasRef);

    const copyToClipboard = useCallback(async (value: string) => {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(value);
                return;
            } catch {
                // Fallback below.
            }
        }

        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.left = '-1000px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }, []);

    const handleDownload = useCallback(() => {
        const currentText = textRef.current || text;
        const suggestedName = 'note.md';
        const rawName = window.prompt('Nom du fichier .md', suggestedName);
        if (!rawName) return;

        let filename = rawName.trim();
        if (!filename) return;
        if (!filename.toLowerCase().endsWith('.md')) {
            filename += '.md';
        }
        filename = filename.replace(/[\\/:*?"<>|]+/g, '-');

        const blob = new Blob([currentText], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [text]);

    const handleCopyLink = useCallback(() => {
        void copyToClipboard(window.location.href);
    }, [copyToClipboard]);

    const handleInput = useCallback((event: JSX.TargetedEvent<HTMLDivElement, Event>) => {
        const currentText = event.currentTarget.innerText;
        textRef.current = currentText;
        setText(currentText);
        if (tryLoadFromText(currentText)) return;
        triggerSave();
    }, [triggerSave, tryLoadFromText]);

    const handleKeyDown = useCallback((event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            const canvas = canvasRef.current;
            if (!canvas) return;
            selectAllContent(canvas);
        }
    }, [canvasRef, selectAllContent]);

    const handlePaste = useCallback((event: JSX.TargetedClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const clipboardData = event.clipboardData || (window as Window & { clipboardData?: DataTransfer }).clipboardData;
        const text = clipboardData ? clipboardData.getData('text') : '';
        if (tryLoadFromText(text)) return;
        document.execCommand('insertText', false, text);
    }, [tryLoadFromText]);

    const handleBackgroundClick = useCallback((event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement | null;
        if (target?.id === 'editor-scroll') {
            const el = canvasRef.current;
            if (!el) return;
            el.focus();
            const currentText = textRef.current || '';
            setCaretOffset(el, currentText.length);
        }
    }, [canvasRef, setCaretOffset, textRef]);

    return (
        <>
            <header>
                <div className="header-left">
                    <img className="header-logo" src={logoUrl} alt="MD Note" />
                </div>
                <div className="header-right">
                    <button
                        className="icon-btn"
                        type="button"
                        onClick={handleDownload}
                        title="Télécharger en .md"
                        aria-label="Télécharger en .md"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 3a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4.02 4a1 1 0 0 1-1.4 0l-4.02-4a1 1 0 1 1 1.4-1.42L11 12.6V4a1 1 0 0 1 1-1zM5 19a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1z" />
                        </svg>
                    </button>
                    <button
                        className="icon-btn"
                        type="button"
                        onClick={handleCopyLink}
                        title="Copier le lien"
                        aria-label="Copier le lien"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M10.6 13.4a1 1 0 0 1 0-1.4l3-3a1 1 0 1 1 1.4 1.4l-3 3a1 1 0 0 1-1.4 0zM7.05 16.95a3.5 3.5 0 0 0 4.95 0l2.12-2.12a1 1 0 1 1 1.41 1.41l-2.12 2.12a5.5 5.5 0 0 1-7.78-7.78l2.12-2.12a1 1 0 1 1 1.41 1.41l-2.12 2.12a3.5 3.5 0 0 0 0 4.95zM16.95 7.05a3.5 3.5 0 0 0-4.95 0l-2.12 2.12a1 1 0 0 1-1.41-1.41l2.12-2.12a5.5 5.5 0 0 1 7.78 7.78l-2.12 2.12a1 1 0 1 1-1.41-1.41l2.12-2.12a3.5 3.5 0 0 0 0-4.95z" />
                        </svg>
                    </button>
                </div>
            </header>

            <div id="editor-shell">
                <div id="editor-scroll" onClick={handleBackgroundClick}>
                    <div
                        id="editor-canvas"
                        ref={canvasRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={handleInput}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                    />
                </div>
                <div id="preview-scroll">
                    <div id="preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
            </div>

            <Toolbar toolbar={toolbar} onAction={applyFormat} />
        </>
    );
}
