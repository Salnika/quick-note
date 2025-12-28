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
