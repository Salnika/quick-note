import LZString from 'lz-string';
import {
    deserializeWBWT,
    serializeWBWT,
    wbwtCompress,
    wbwtDecompress
} from './wbwt';

const PREFIX_LZ = '#v1.';
const PREFIX_WBWT = '#w4.';
const HASH_PAYLOAD_PATTERN = /^[A-Za-z0-9+\-_$]+$/;
const URL_HASH_PATTERN = /^(?:https?:\/\/\S+)?#(v1|w4)\.([A-Za-z0-9+\-_$]+)$/;
const DIRECT_HASH_PATTERN = /^(v1|w4)\.([A-Za-z0-9+\-_$]+)$/;
const WBWT_MAX_CHARS = 20000;

export type HashVersion = 'v1' | 'w4';

export type PayloadInfo = {
    version: HashVersion;
    payload: string;
};

// --- 1. Base64 URL Helpers ---
function toBase64Url(bytes: Uint8Array) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(payload: string) {
    let base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;
    if (padding) base64 += '='.repeat(4 - padding);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// --- 2. Payload Parsing ---
export function extractPayloadFromText(text: string): PayloadInfo | null {
    const trimmed = text.trim();
    const urlMatch = trimmed.match(URL_HASH_PATTERN);
    if (urlMatch) return { version: urlMatch[1] as HashVersion, payload: urlMatch[2] };
    const directMatch = trimmed.match(DIRECT_HASH_PATTERN);
    if (directMatch) return { version: directMatch[1] as HashVersion, payload: directMatch[2] };
    return null;
}

export function extractPayloadFromHash(hash: string): PayloadInfo | null {
    if (!hash) return null;
    const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
    const match = cleaned.match(DIRECT_HASH_PATTERN);
    if (!match) return null;
    return { version: match[1] as HashVersion, payload: match[2] };
}

export function buildHashFromPayload(version: HashVersion, payload: string) {
    const prefix = version === 'w4' ? PREFIX_WBWT : PREFIX_LZ;
    return prefix + payload;
}

export function decodePayload(payloadInfo: PayloadInfo | null): string | null {
    if (!payloadInfo) return null;
    const { version, payload } = payloadInfo;
    if (!payload || !HASH_PAYLOAD_PATTERN.test(payload)) return null;

    let decompressed = null;
    if (version === 'w4') {
        try {
            const bytes = fromBase64Url(payload);
            const wbwtPayload = deserializeWBWT(bytes);
            decompressed = wbwtDecompress(wbwtPayload);
        } catch {
        }
    } else {
        decompressed = LZString.decompressFromEncodedURIComponent(payload);
        if (!decompressed) {
            try {
                decompressed = LZString.decompressFromEncodedURIComponent(decodeURIComponent(payload));
            } catch {
            }
        }
    }

    return decompressed === null ? null : decompressed;
}

// --- 3. Hash Writing ---
export function buildBestHash(text: string) {
    const fullText = text || '';
    const lzPayload = LZString.compressToEncodedURIComponent(fullText);
    let bestPayload = lzPayload;
    let bestPrefix = PREFIX_LZ;

    if (fullText.length <= WBWT_MAX_CHARS) {
        try {
            const wbwtPayload = wbwtCompress(fullText);
            const wbwtBytes = serializeWBWT(wbwtPayload);
            const wbwtEncoded = toBase64Url(wbwtBytes);
            if (wbwtEncoded.length < lzPayload.length) {
                bestPayload = wbwtEncoded;
                bestPrefix = PREFIX_WBWT;
            }
        } catch {
        }
    }

    return bestPrefix + bestPayload;
}

export function replaceUrlHash(hash: string) {
    if (window.location.hash === hash) return;
    const url = window.location.href.split('#')[0] + hash;
    window.history.replaceState(null, '', url);
}
