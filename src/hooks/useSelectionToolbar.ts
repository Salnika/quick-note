import { useCallback, useEffect, useState } from 'preact/hooks';
import type { ToolbarAction, ToolbarState } from '../types/editor';

const TOOLBAR_WIDTH = 200;
const TOOLBAR_PADDING = 10;
const TOOLBAR_OFFSET_Y = 45;

// --- 1. Selection Toolbar ---
type CanvasRef = {
    current: HTMLElement | null;
};

export function useSelectionToolbar(canvasRef: CanvasRef) {
    const [toolbar, setToolbar] = useState<ToolbarState>({ visible: false, top: 0, left: 0 });

    const updateToolbar = useCallback(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) {
            setToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
            return;
        }

        const canvas = canvasRef.current;
        const anchorNode = selection.anchorNode;
        if (!canvas || !anchorNode || !canvas.contains(anchorNode)) {
            setToolbar((prev) => (prev.visible ? { ...prev, visible: false } : prev));
            return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        let left = rect.left + (rect.width / 2) - (TOOLBAR_WIDTH / 2);
        if (left < TOOLBAR_PADDING) left = TOOLBAR_PADDING;
        if (left + TOOLBAR_WIDTH > window.innerWidth) {
            left = window.innerWidth - TOOLBAR_WIDTH - TOOLBAR_PADDING;
        }

        setToolbar({
            visible: true,
            top: rect.top - TOOLBAR_OFFSET_Y + window.scrollY,
            left
        });
    }, [canvasRef]);

    useEffect(() => {
        document.addEventListener('selectionchange', updateToolbar);
        return () => document.removeEventListener('selectionchange', updateToolbar);
    }, [updateToolbar]);

    const applyFormat = useCallback((type: ToolbarAction) => {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;

        const text = selection.toString();
        let newText = text;

        switch (type) {
            case 'bold':
                newText = `**${text}**`;
                break;
            case 'italic':
                newText = `*${text}*`;
                break;
            case 'code':
                newText = `\`${text}\``;
                break;
            case 'h1':
                newText = `# ${text}`;
                break;
            case 'h2':
                newText = `## ${text}`;
                break;
            case 'list':
                newText = `- ${text}`;
                break;
            default:
                break;
        }

        document.execCommand('insertText', false, newText);
    }, []);

    return { toolbar, applyFormat };
}
