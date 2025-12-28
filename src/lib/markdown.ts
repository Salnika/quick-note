// --- 1. Inline Markdown Parsing ---
function parseLine(text: string): string {
    if (!text) return '<br>';

    let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    if (/^#\s/.test(html)) return `<h1>${html.slice(2)}</h1>`;
    if (/^##\s/.test(html)) return `<h2>${html.slice(3)}</h2>`;
    if (/^###\s/.test(html)) return `<h3>${html.slice(4)}</h3>`;

    if (/^>\s/.test(html)) return `<blockquote>${html.slice(2)}</blockquote>`;

    if (/^-\s/.test(html)) return `<ul><li>${html.slice(2)}</li></ul>`;

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/([^*]|^)\*(?!\*)([^*]+)\*/g, '$1<em>$2</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    html = html.replace(/~~(.*?)~~/g, '<s>$1</s>');

    return html;
}

export function parseMarkdown(text: string): string {
    const lines = text.split('\n');
    return lines.map((line) => `<div class="preview-line">${parseLine(line)}</div>`).join('');
}
