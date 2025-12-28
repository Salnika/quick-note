import type { JSX } from 'preact';
import type { ToolbarAction, ToolbarState } from '../types/editor';

type ToolbarProps = {
    toolbar: ToolbarState;
    onAction: (action: ToolbarAction) => void;
};

// --- 1. Floating Toolbar ---
export function Toolbar({ toolbar, onAction }: ToolbarProps) {
    const handleMouseDown = (action: ToolbarAction) => (event: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        onAction(action);
    };

    return (
        <div
            id="toolbar"
            className={toolbar.visible ? 'visible' : ''}
            style={{ top: `${toolbar.top}px`, left: `${toolbar.left}px` }}
        >
            <button className="tool-btn" onMouseDown={handleMouseDown('bold')} title="Gras">B</button>
            <button className="tool-btn" onMouseDown={handleMouseDown('italic')} title="Italique">I</button>
            <button className="tool-btn" onMouseDown={handleMouseDown('code')} title="Code">&lt;&gt;</button>
            <div className="tool-divider"></div>
            <button className="tool-btn" onMouseDown={handleMouseDown('h1')} title="Titre 1">H1</button>
            <button className="tool-btn" onMouseDown={handleMouseDown('h2')} title="Titre 2">H2</button>
            <button className="tool-btn" onMouseDown={handleMouseDown('list')} title="Liste">•</button>
        </div>
    );
}
