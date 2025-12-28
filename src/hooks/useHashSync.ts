import { useCallback, useEffect, useRef } from 'preact/hooks';
import {
    buildBestHash,
    buildHashFromPayload,
    decodePayload,
    extractPayloadFromHash,
    extractPayloadFromText,
    replaceUrlHash
} from '../lib/hash';
import type { PayloadInfo } from '../lib/hash';

// --- 1. Hash Synchronization ---
type HashSyncOptions = {
    textRef: { current: string };
    setText: (value: string) => void;
};

export function useHashSync({ textRef, setText }: HashSyncOptions) {
    const debounceRef = useRef<number | null>(null);

    const applyPayload = useCallback((payloadInfo: PayloadInfo) => {
        const decompressed = decodePayload(payloadInfo);
        if (decompressed === null) return false;
        textRef.current = decompressed;
        setText(decompressed);
        replaceUrlHash(buildHashFromPayload(payloadInfo.version, payloadInfo.payload));
        return true;
    }, [setText, textRef]);

    const tryLoadFromText = useCallback((text: string) => {
        const payload = extractPayloadFromText(text);
        if (!payload) return false;
        return applyPayload(payload);
    }, [applyPayload]);

    const saveToHash = useCallback(() => {
        const fullText = textRef.current || '';
        const newHash = buildBestHash(fullText);
        replaceUrlHash(newHash);
    }, [textRef]);

    const triggerSave = useCallback(() => {
        if (debounceRef.current !== null) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = window.setTimeout(() => {
            saveToHash();
        }, 600);
    }, [saveToHash]);

    const loadFromHash = useCallback(() => {
        const payload = extractPayloadFromHash(window.location.hash);
        if (!payload) return;
        applyPayload(payload);
    }, [applyPayload]);

    useEffect(() => {
        loadFromHash();
        window.addEventListener('hashchange', loadFromHash);
        return () => window.removeEventListener('hashchange', loadFromHash);
    }, [loadFromHash]);

    useEffect(() => {
        return () => {
            if (debounceRef.current !== null) {
                clearTimeout(debounceRef.current);
            }
        };
    }, []);

    return { tryLoadFromText, triggerSave };
}
