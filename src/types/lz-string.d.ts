declare module 'lz-string' {
    const LZString: {
        compressToEncodedURIComponent(value: string): string;
        decompressFromEncodedURIComponent(value: string): string | null;
        compressToUint8Array(value: string): Uint8Array;
    };
    export default LZString;
}
