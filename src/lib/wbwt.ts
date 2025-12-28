const TOKEN_PATTERN = /[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*|[^\sA-Za-z0-9]+|\s+/g;
const WORD_PATTERN = /^[A-Za-z]+(?:['-][A-Za-z]+)*$/;
const NUMBER_PATTERN = /^\d+$/;
const SPACE_PATTERN = /^ +$/;
const NEWLINE_PATTERN = /^\n+$/;
const TAB_PATTERN = /^\t+$/;

const CONTROL_PREFIX = '\x1F';
const TOKEN_WS_SPACE = `${CONTROL_PREFIX}s`;
const TOKEN_WS_NEWLINE = `${CONTROL_PREFIX}n`;
const TOKEN_WS_TAB = `${CONTROL_PREFIX}t`;
const TOKEN_NUM = `${CONTROL_PREFIX}d`;
const TOKEN_CASE_UPPER = `${CONTROL_PREFIX}u`;
const TOKEN_CASE_TITLE = `${CONTROL_PREFIX}c`;
const TOKEN_ESCAPE = `${CONTROL_PREFIX}e`;

const WBWT_MAGIC = 0x57425754;
const WBWT_VERSION = 4;
const SENTINEL_ID = 0;
const ENTROPY_MAX_TOTAL = 1 << 15;
const ENTROPY_TOP_VALUE = 0xFFFFFFFF;
const ENTROPY_FIRST_QTR = 0x40000000;
const ENTROPY_HALF = 0x80000000;
const ENTROPY_THIRD_QTR = 0xC0000000;

// --- 0. Byte Utilities ---
class ByteWriter {
    buffer: Uint8Array;
    length: number;

    constructor(initialSize: number = 256) {
        this.buffer = new Uint8Array(initialSize);
        this.length = 0;
    }

    ensure(extra: number) {
        const needed = this.length + extra;
        if (needed <= this.buffer.length) return;
        let size = this.buffer.length;
        while (size < needed) size *= 2;
        const next = new Uint8Array(size);
        next.set(this.buffer);
        this.buffer = next;
    }

    pushByte(value: number) {
        this.ensure(1);
        this.buffer[this.length++] = value & 0xff;
    }

    pushBytes(bytes: Uint8Array) {
        this.ensure(bytes.length);
        this.buffer.set(bytes, this.length);
        this.length += bytes.length;
    }

    pushUint32LE(value: number) {
        this.ensure(4);
        const offset = this.length;
        this.buffer[offset] = value & 0xff;
        this.buffer[offset + 1] = (value >>> 8) & 0xff;
        this.buffer[offset + 2] = (value >>> 16) & 0xff;
        this.buffer[offset + 3] = (value >>> 24) & 0xff;
        this.length += 4;
    }

    toUint8Array(): Uint8Array {
        return this.buffer.slice(0, this.length);
    }
}

class BitWriter {
    writer: ByteWriter;
    current: number;
    filled: number;

    constructor() {
        this.writer = new ByteWriter();
        this.current = 0;
        this.filled = 0;
    }

    writeBit(bit: number) {
        this.current = (this.current << 1) | (bit & 1);
        this.filled++;
        if (this.filled === 8) {
            this.writer.pushByte(this.current);
            this.current = 0;
            this.filled = 0;
        }
    }

    finish(): Uint8Array {
        if (this.filled > 0) {
            this.current <<= 8 - this.filled;
            this.writer.pushByte(this.current);
        }
        return this.writer.toUint8Array();
    }
}

class BitReader {
    bytes: Uint8Array;
    index: number;
    current: number;
    remaining: number;

    constructor(bytes: Uint8Array) {
        this.bytes = bytes;
        this.index = 0;
        this.current = 0;
        this.remaining = 0;
    }

    readBit(): number {
        if (this.remaining === 0) {
            this.current = this.index < this.bytes.length ? this.bytes[this.index++] : 0;
            this.remaining = 8;
        }
        const bit = (this.current & 0x80) !== 0 ? 1 : 0;
        this.current = (this.current << 1) & 0xFF;
        this.remaining--;
        return bit;
    }

    readBits(count: number): number {
        let value = 0;
        for (let i = 0; i < count; i++) {
            value = (value << 1) | this.readBit();
        }
        return value >>> 0;
    }
}

class FenwickTree {
    size: number;
    tree: Uint32Array;
    freq: Uint32Array;
    total: number;

    constructor(size: number) {
        this.size = size;
        this.tree = new Uint32Array(size + 1);
        this.freq = new Uint32Array(size + 1);
        this.total = 0;
    }

    reset(value: number) {
        this.tree.fill(0);
        this.freq.fill(0);
        this.total = 0;

        for (let i = 1; i <= this.size; i++) {
            this.freq[i] = value;
            this.total += value;
            let idx = i;
            while (idx <= this.size) {
                this.tree[idx] += value;
                idx += idx & -idx;
            }
        }
    }

    sum(index: number): number {
        let result = 0;
        let idx = index;
        while (idx > 0) {
            result += this.tree[idx];
            idx -= idx & -idx;
        }
        return result;
    }

    add(index: number, delta: number) {
        this.freq[index] += delta;
        this.total += delta;
        let idx = index;
        while (idx <= this.size) {
            this.tree[idx] += delta;
            idx += idx & -idx;
        }
    }

    rescale() {
        this.tree.fill(0);
        this.total = 0;
        for (let i = 1; i <= this.size; i++) {
            let value = (this.freq[i] + 1) >> 1;
            if (value === 0) value = 1;
            this.freq[i] = value;
            this.total += value;
            let idx = i;
            while (idx <= this.size) {
                this.tree[idx] += value;
                idx += idx & -idx;
            }
        }
    }

    findByCumulative(value: number): number {
        let idx = 0;
        let bit = 1;
        while (bit <= this.size) bit <<= 1;
        bit >>= 1;
        let sum = 0;
        while (bit !== 0) {
            const next = idx + bit;
            if (next <= this.size && sum + this.tree[next] <= value) {
                sum += this.tree[next];
                idx = next;
            }
            bit >>= 1;
        }
        return idx + 1;
    }
}

function writeVarint(writer: ByteWriter, value: number) {
    let current = value >>> 0;
    while (current >= 0x80) {
        writer.pushByte((current & 0x7f) | 0x80);
        current >>>= 7;
    }
    writer.pushByte(current);
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; offset: number } {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
        byte = bytes[offset++];
        result |= (byte & 0x7f) << shift;
        shift += 7;
    } while (byte & 0x80);
    return { value: result >>> 0, offset };
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}

// --- 1. Entropy Coding (Adaptive Arithmetic) ---
class ArithmeticEncoder {
    writer: BitWriter;
    low: number;
    high: number;
    pending: number;

    constructor(writer: BitWriter) {
        this.writer = writer;
        this.low = 0;
        this.high = ENTROPY_TOP_VALUE;
        this.pending = 0;
    }

    outputBitAndPending(bit: number) {
        this.writer.writeBit(bit);
        const fill = bit === 0 ? 1 : 0;
        while (this.pending > 0) {
            this.writer.writeBit(fill);
            this.pending--;
        }
    }

    encodeSymbol(model: FenwickTree, symbolIndex: number) {
        const total = model.total;
        const cum = model.sum(symbolIndex - 1);
        const freq = model.freq[symbolIndex];
        const range = this.high - this.low + 1;

        this.high = this.low + Math.floor(range * (cum + freq) / total) - 1;
        this.low = this.low + Math.floor(range * cum / total);

        while (true) {
            if (this.high < ENTROPY_HALF) {
                this.outputBitAndPending(0);
            } else if (this.low >= ENTROPY_HALF) {
                this.outputBitAndPending(1);
                this.low -= ENTROPY_HALF;
                this.high -= ENTROPY_HALF;
            } else if (this.low >= ENTROPY_FIRST_QTR && this.high < ENTROPY_THIRD_QTR) {
                this.pending++;
                this.low -= ENTROPY_FIRST_QTR;
                this.high -= ENTROPY_FIRST_QTR;
            } else {
                break;
            }
            this.low = this.low * 2;
            this.high = this.high * 2 + 1;
        }
    }

    finish() {
        this.pending++;
        if (this.low < ENTROPY_FIRST_QTR) this.outputBitAndPending(0);
        else this.outputBitAndPending(1);
    }
}

class ArithmeticDecoder {
    reader: BitReader;
    low: number;
    high: number;
    value: number;

    constructor(reader: BitReader) {
        this.reader = reader;
        this.low = 0;
        this.high = ENTROPY_TOP_VALUE;
        this.value = reader.readBits(32);
    }

    decodeSymbol(model: FenwickTree): number {
        const total = model.total;
        const range = this.high - this.low + 1;
        const cumValue = Math.floor(((this.value - this.low + 1) * total - 1) / range);
        const symbolIndex = model.findByCumulative(cumValue);
        const cum = model.sum(symbolIndex - 1);
        const freq = model.freq[symbolIndex];

        this.high = this.low + Math.floor(range * (cum + freq) / total) - 1;
        this.low = this.low + Math.floor(range * cum / total);

        while (true) {
            if (this.high < ENTROPY_HALF) {
                // no-op
            } else if (this.low >= ENTROPY_HALF) {
                this.value -= ENTROPY_HALF;
                this.low -= ENTROPY_HALF;
                this.high -= ENTROPY_HALF;
            } else if (this.low >= ENTROPY_FIRST_QTR && this.high < ENTROPY_THIRD_QTR) {
                this.value -= ENTROPY_FIRST_QTR;
                this.low -= ENTROPY_FIRST_QTR;
                this.high -= ENTROPY_FIRST_QTR;
            } else {
                break;
            }
            this.low = this.low * 2;
            this.high = this.high * 2 + 1;
            this.value = (this.value * 2 + this.reader.readBit()) >>> 0;
        }

        return symbolIndex;
    }
}

function entropyEncodeBytes(bytes: Uint8Array): Uint8Array {
    if (bytes.length === 0) return new Uint8Array(0);
    const model = new FenwickTree(256);
    model.reset(1);
    const writer = new BitWriter();
    const encoder = new ArithmeticEncoder(writer);

    for (let i = 0; i < bytes.length; i++) {
        const symbolIndex = bytes[i] + 1;
        encoder.encodeSymbol(model, symbolIndex);
        model.add(symbolIndex, 1);
        if (model.total >= ENTROPY_MAX_TOTAL) model.rescale();
    }

    encoder.finish();
    return writer.finish();
}

function entropyDecodeBytes(bytes: Uint8Array, outputLength: number): Uint8Array {
    if (outputLength === 0) return new Uint8Array(0);
    const model = new FenwickTree(256);
    model.reset(1);
    const reader = new BitReader(bytes);
    const decoder = new ArithmeticDecoder(reader);
    const output = new Uint8Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
        const symbolIndex = decoder.decodeSymbol(model);
        output[i] = symbolIndex - 1;
        model.add(symbolIndex, 1);
        if (model.total >= ENTROPY_MAX_TOTAL) model.rescale();
    }

    return output;
}

function entropyEncodeSymbols(symbols: Uint32Array, alphabetSize: number): Uint8Array {
    if (symbols.length === 0) return new Uint8Array(0);
    const model = new FenwickTree(alphabetSize);
    model.reset(1);
    const writer = new BitWriter();
    const encoder = new ArithmeticEncoder(writer);

    for (let i = 0; i < symbols.length; i++) {
        const symbolIndex = symbols[i] + 1;
        encoder.encodeSymbol(model, symbolIndex);
        model.add(symbolIndex, 1);
        if (model.total >= ENTROPY_MAX_TOTAL) model.rescale();
    }

    encoder.finish();
    return writer.finish();
}

function entropyDecodeSymbols(bytes: Uint8Array, symbolCount: number, alphabetSize: number): Uint32Array {
    if (symbolCount === 0) return new Uint32Array(0);
    const model = new FenwickTree(alphabetSize);
    model.reset(1);
    const reader = new BitReader(bytes);
    const decoder = new ArithmeticDecoder(reader);
    const output = new Uint32Array(symbolCount);

    for (let i = 0; i < symbolCount; i++) {
        const symbolIndex = decoder.decodeSymbol(model);
        output[i] = symbolIndex - 1;
        model.add(symbolIndex, 1);
        if (model.total >= ENTROPY_MAX_TOTAL) model.rescale();
    }

    return output;
}

// --- 2. Tokenization & Mapping ---
function tokenize(text: string): string[] {
    if (!text) return [];
    return text.match(TOKEN_PATTERN) || [];
}

function normalizeTokens(tokens: string[]): string[] {
    const normalized: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.startsWith(CONTROL_PREFIX)) {
            normalized.push(TOKEN_ESCAPE, token);
            continue;
        }

        if (SPACE_PATTERN.test(token)) {
            normalized.push(TOKEN_WS_SPACE, token.length.toString(36));
            continue;
        }
        if (NEWLINE_PATTERN.test(token)) {
            normalized.push(TOKEN_WS_NEWLINE, token.length.toString(36));
            continue;
        }
        if (TAB_PATTERN.test(token)) {
            normalized.push(TOKEN_WS_TAB, token.length.toString(36));
            continue;
        }
        if (NUMBER_PATTERN.test(token)) {
            normalized.push(TOKEN_NUM, token);
            continue;
        }
        if (WORD_PATTERN.test(token)) {
            const lower = token.toLowerCase();
            if (token === lower) {
                normalized.push(lower);
                continue;
            }
            if (token === token.toUpperCase()) {
                normalized.push(TOKEN_CASE_UPPER, lower);
                continue;
            }
            const title = token[0].toUpperCase() + token.slice(1).toLowerCase();
            if (token === title) {
                normalized.push(TOKEN_CASE_TITLE, lower);
                continue;
            }
        }

        normalized.push(token);
    }

    return normalized;
}

function tokensToIds(tokens: string[]): { ids: Uint32Array; dictionary: string[] } {
    const dictionary: string[] = [];
    const tokenToId = new Map<string, number>();
    const ids = new Uint32Array(tokens.length);

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        let id = tokenToId.get(token);
        if (id === undefined) {
            id = dictionary.length + 1;
            tokenToId.set(token, id);
            dictionary.push(token);
        }
        ids[i] = id;
    }

    const sortedDictionary = [...dictionary].sort();
    const tokenToNewId = new Map<string, number>();
    for (let i = 0; i < sortedDictionary.length; i++) {
        tokenToNewId.set(sortedDictionary[i], i + 1);
    }

    const oldToNew = new Uint32Array(dictionary.length + 1);
    for (let i = 0; i < dictionary.length; i++) {
        oldToNew[i + 1] = tokenToNewId.get(dictionary[i])!;
    }

    for (let i = 0; i < ids.length; i++) {
        ids[i] = oldToNew[ids[i]];
    }

    return { ids, dictionary: sortedDictionary };
}

function renderTokens(tokens: string[]): string {
    const output: string[] = [];
    let pendingCase: 'upper' | 'title' | null = null;
    let pendingMode: 'space' | 'newline' | 'tab' | 'number' | 'escape' | null = null;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token === TOKEN_CASE_UPPER) {
            pendingCase = 'upper';
            continue;
        }
        if (token === TOKEN_CASE_TITLE) {
            pendingCase = 'title';
            continue;
        }
        if (token === TOKEN_WS_SPACE) {
            pendingMode = 'space';
            continue;
        }
        if (token === TOKEN_WS_NEWLINE) {
            pendingMode = 'newline';
            continue;
        }
        if (token === TOKEN_WS_TAB) {
            pendingMode = 'tab';
            continue;
        }
        if (token === TOKEN_NUM) {
            pendingMode = 'number';
            continue;
        }
        if (token === TOKEN_ESCAPE) {
            pendingMode = 'escape';
            continue;
        }

        if (pendingMode) {
            const length = parseInt(token, 36);
            const count = Number.isFinite(length) ? length : 0;
            if (pendingMode === 'space') output.push(' '.repeat(count));
            else if (pendingMode === 'newline') output.push('\n'.repeat(count));
            else if (pendingMode === 'tab') output.push('\t'.repeat(count));
            else if (pendingMode === 'number') output.push(token);
            else if (pendingMode === 'escape') output.push(token);
            pendingMode = null;
            continue;
        }

        let text = token;
        if (pendingCase === 'upper') {
            text = token.toUpperCase();
            pendingCase = null;
        } else if (pendingCase === 'title') {
            text = token ? token[0].toUpperCase() + token.slice(1).toLowerCase() : token;
            pendingCase = null;
        }

        output.push(text);
    }

    return output.join('');
}

// --- 3. Word-Based Burrows-Wheeler Transform ---
function compareRotation(ids: Uint32Array, length: number, left: number, right: number): number {
    for (let offset = 0; offset < length; offset++) {
        const leftIndex = left + offset < length ? left + offset : left + offset - length;
        const rightIndex = right + offset < length ? right + offset : right + offset - length;
        const leftValue = ids[leftIndex];
        const rightValue = ids[rightIndex];
        if (leftValue < rightValue) return -1;
        if (leftValue > rightValue) return 1;
    }
    return 0;
}

function buildCyclicSuffixArray(ids: Uint32Array): Int32Array {
    const length = ids.length;
    const indices = new Int32Array(length);
    for (let i = 0; i < length; i++) indices[i] = i;

    indices.sort((left, right) => compareRotation(ids, length, left, right));

    return indices;
}

function burrowsWheelerTransform(ids: Uint32Array): { lastColumn: Uint32Array; primaryIndex: number } {
    const length = ids.length;
    if (length === 0) {
        return { lastColumn: new Uint32Array(0), primaryIndex: 0 };
    }
    if (length === 1) {
        return { lastColumn: new Uint32Array([ids[0]]), primaryIndex: 0 };
    }

    const order = buildCyclicSuffixArray(ids);
    const lastColumn = new Uint32Array(length);
    let primaryIndex = 0;

    for (let i = 0; i < length; i++) {
        const start = order[i];
        const lastIndex = start === 0 ? length - 1 : start - 1;
        lastColumn[i] = ids[lastIndex];
        if (start === 0) primaryIndex = i;
    }

    return { lastColumn, primaryIndex };
}

function inverseBurrowsWheelerTransform(
    lastColumn: Uint32Array,
    primaryIndex: number,
    alphabetSize: number
): Uint32Array {
    const length = lastColumn.length;
    if (length === 0) return new Uint32Array(0);

    const counts = new Uint32Array(alphabetSize);
    for (let i = 0; i < length; i++) counts[lastColumn[i]]++;

    const starts = new Uint32Array(alphabetSize);
    let sum = 0;
    for (let i = 0; i < alphabetSize; i++) {
        starts[i] = sum;
        sum += counts[i];
    }

    const occ = new Uint32Array(alphabetSize);
    const next = new Uint32Array(length);
    for (let i = 0; i < length; i++) {
        const symbol = lastColumn[i];
        const pos = starts[symbol] + occ[symbol];
        next[pos] = i;
        occ[symbol]++;
    }

    const restored = new Uint32Array(length);
    let row = primaryIndex;
    for (let i = length - 1; i >= 0; i--) {
        row = next[row];
        restored[i] = lastColumn[row];
    }

    return restored;
}

// --- 4. Move-To-Front ---
function moveToFrontEncode(sequence: Uint32Array, alphabetSize: number): Uint32Array {
    const mtf = new Uint32Array(sequence.length);
    const list = new Uint32Array(alphabetSize);
    const positions = new Uint32Array(alphabetSize);

    for (let i = 0; i < alphabetSize; i++) {
        list[i] = i;
        positions[i] = i;
    }

    for (let i = 0; i < sequence.length; i++) {
        const symbol = sequence[i];
        const pos = positions[symbol];
        mtf[i] = pos;

        if (pos !== 0) {
            for (let j = pos; j > 0; j--) {
                const moved = list[j - 1];
                list[j] = moved;
                positions[moved] = j;
            }
            list[0] = symbol;
            positions[symbol] = 0;
        }
    }

    return mtf;
}

function moveToFrontDecode(mtf: Uint32Array, alphabetSize: number): Uint32Array {
    const sequence = new Uint32Array(mtf.length);
    const list = new Uint32Array(alphabetSize);

    for (let i = 0; i < alphabetSize; i++) list[i] = i;

    for (let i = 0; i < mtf.length; i++) {
        const pos = mtf[i];
        const symbol = list[pos];
        sequence[i] = symbol;

        if (pos !== 0) {
            for (let j = pos; j > 0; j--) {
                list[j] = list[j - 1];
            }
            list[0] = symbol;
        }
    }

    return sequence;
}

// --- 5. Legacy RLE + Varint ---
function encodeMtfRle(mtf: Uint32Array): Uint8Array {
    const writer = new ByteWriter(Math.max(16, mtf.length));
    let zeroRun = 0;

    for (let i = 0; i < mtf.length; i++) {
        const value = mtf[i];
        if (value === 0) {
            zeroRun++;
            continue;
        }

        if (zeroRun > 0) {
            writeVarint(writer, zeroRun << 1);
            zeroRun = 0;
        }
        writeVarint(writer, (value << 1) | 1);
    }

    if (zeroRun > 0) writeVarint(writer, zeroRun << 1);

    return writer.toUint8Array();
}

function decodeMtfRle(bytes: Uint8Array, offset: number, tokenCount: number): { mtf: Uint32Array; offset: number } {
    const mtf = new Uint32Array(tokenCount);
    let index = 0;

    while (index < tokenCount) {
        const parsed = readVarint(bytes, offset);
        const value = parsed.value;
        offset = parsed.offset;

        if ((value & 1) === 0) {
            let run = value >>> 1;
            while (run > 0 && index < tokenCount) {
                mtf[index++] = 0;
                run--;
            }
        } else {
            mtf[index++] = value >>> 1;
        }
    }

    return { mtf, offset };
}

// --- 6. Zero-Run Encoding (RUNA/RUNB) ---
function mtfToSymbols(mtf: Uint32Array): Uint32Array {
    const symbols: number[] = [];
    let run = 0;

    const flushRun = () => {
        while (run > 0) {
            const digit = ((run - 1) & 1) + 1;
            symbols.push(digit - 1);
            run = (run - 1) >> 1;
        }
    };

    for (let i = 0; i < mtf.length; i++) {
        const value = mtf[i];
        if (value === 0) {
            run++;
            continue;
        }

        if (run > 0) {
            flushRun();
            run = 0;
        }

        symbols.push(value + 1);
    }

    if (run > 0) flushRun();

    return Uint32Array.from(symbols);
}

function symbolsToMtf(symbols: Uint32Array, tokenCount: number): Uint32Array {
    const mtf = new Uint32Array(tokenCount);
    let mtfIndex = 0;
    let run = 0;
    let base = 1;

    for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];

        if (symbol <= 1) {
            run += (symbol === 0 ? 1 : 2) * base;
            base <<= 1;
            continue;
        }

        if (run > 0) {
            while (run > 0 && mtfIndex < tokenCount) {
                mtf[mtfIndex++] = 0;
                run--;
            }
            run = 0;
            base = 1;
        }

        if (mtfIndex < tokenCount) {
            mtf[mtfIndex++] = symbol - 1;
        }
    }

    while (run > 0 && mtfIndex < tokenCount) {
        mtf[mtfIndex++] = 0;
        run--;
    }

    return mtf;
}

// --- 7. Public API ---
export type WBWTPayload = {
    dictionary: string[];
    primaryIndex: number;
    mtf: Uint32Array;
};

export function wbwtCompress(text: string): WBWTPayload {
    const rawTokens = tokenize(text);
    const tokens = normalizeTokens(rawTokens);
    if (tokens.length === 0) {
        return {
            dictionary: [],
            primaryIndex: 0,
            mtf: new Uint32Array(0)
        };
    }

    const { ids, dictionary } = tokensToIds(tokens);
    const idsWithSentinel = new Uint32Array(ids.length + 1);
    idsWithSentinel.set(ids, 0);
    idsWithSentinel[ids.length] = SENTINEL_ID;

    const { lastColumn, primaryIndex } = burrowsWheelerTransform(idsWithSentinel);
    const mtf = moveToFrontEncode(lastColumn, dictionary.length + 1);

    return { dictionary, primaryIndex, mtf };
}

export function wbwtDecompress(payload: WBWTPayload | null): string {
    if (!payload || !payload.dictionary || !payload.mtf) return '';
    const { dictionary, primaryIndex, mtf } = payload;
    if (dictionary.length === 0 || mtf.length === 0) return '';

    const alphabetSize = dictionary.length + 1;
    const lastColumn = moveToFrontDecode(mtf, alphabetSize);
    const ids = inverseBurrowsWheelerTransform(lastColumn, primaryIndex, alphabetSize);
    const tokens: string[] = [];

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id !== SENTINEL_ID) tokens.push(dictionary[id - 1]);
    }

    return renderTokens(tokens);
}

// --- 8. Binary Pack/Unpack (Optional storage stage) ---
export function serializeWBWT(payload: WBWTPayload): Uint8Array {
    const { dictionary, primaryIndex, mtf } = payload;
    const encoder = new TextEncoder();
    const writer = new ByteWriter();
    const alphabetSize = dictionary.length + 1;
    const symbols = mtfToSymbols(mtf);

    writer.pushUint32LE(WBWT_MAGIC);
    writer.pushUint32LE(WBWT_VERSION);
    writeVarint(writer, dictionary.length);
    writeVarint(writer, mtf.length);
    writeVarint(writer, primaryIndex >>> 0);
    writeVarint(writer, symbols.length);

    let prevBytes = new Uint8Array(0);
    for (let i = 0; i < dictionary.length; i++) {
        const bytes = encoder.encode(dictionary[i]);
        let prefix = 0;
        const maxPrefix = Math.min(prevBytes.length, bytes.length);
        while (prefix < maxPrefix && prevBytes[prefix] === bytes[prefix]) prefix++;
        const suffix = bytes.subarray(prefix);
        writeVarint(writer, prefix);
        writeVarint(writer, suffix.length);
        writer.pushBytes(suffix);
        prevBytes = bytes;
    }

    const entropyPacked = entropyEncodeSymbols(symbols, alphabetSize + 1);
    writer.pushBytes(entropyPacked);

    return writer.toUint8Array();
}

export function deserializeWBWT(buffer: ArrayBuffer | Uint8Array): WBWTPayload {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const decoder = new TextDecoder();

    let offset = 0;
    const magic = readUint32LE(bytes, offset);
    offset += 4;
    if (magic !== WBWT_MAGIC) throw new Error('WBWT: invalid header');

    const version = readUint32LE(bytes, offset);
    offset += 4;
    if (version !== 2 && version !== 3 && version !== WBWT_VERSION) {
        throw new Error('WBWT: unsupported version');
    }

    const dictParsed = readVarint(bytes, offset);
    const dictCount = dictParsed.value;
    offset = dictParsed.offset;

    const tokenParsed = readVarint(bytes, offset);
    const tokenCount = tokenParsed.value;
    offset = tokenParsed.offset;

    const primaryParsed = readVarint(bytes, offset);
    const primaryIndex = primaryParsed.value;
    offset = primaryParsed.offset;

    let symbolCount = 0;
    if (version === WBWT_VERSION) {
        const symbolParsed = readVarint(bytes, offset);
        symbolCount = symbolParsed.value;
        offset = symbolParsed.offset;
    }

    const dictionary: string[] = new Array(dictCount);
    if (version === WBWT_VERSION) {
        let prevBytes = new Uint8Array(0);
        for (let i = 0; i < dictCount; i++) {
            const prefixParsed = readVarint(bytes, offset);
            const prefix = prefixParsed.value;
            offset = prefixParsed.offset;
            const suffixParsed = readVarint(bytes, offset);
            const suffixLength = suffixParsed.value;
            offset = suffixParsed.offset;
            const suffix = bytes.subarray(offset, offset + suffixLength);
            offset += suffixLength;
            const tokenBytes = new Uint8Array(prefix + suffixLength);
            if (prefix > 0) tokenBytes.set(prevBytes.subarray(0, prefix), 0);
            tokenBytes.set(suffix, prefix);
            dictionary[i] = decoder.decode(tokenBytes);
            prevBytes = tokenBytes;
        }
    } else {
        for (let i = 0; i < dictCount; i++) {
            const parsed = readVarint(bytes, offset);
            const length = parsed.value;
            offset = parsed.offset;
            const slice = bytes.subarray(offset, offset + length);
            dictionary[i] = decoder.decode(slice);
            offset += length;
        }
    }

    let mtf: Uint32Array;
    if (version === WBWT_VERSION) {
        const entropyBytes = bytes.subarray(offset);
        const symbols = entropyDecodeSymbols(entropyBytes, symbolCount, dictCount + 2);
        mtf = symbolsToMtf(symbols, tokenCount);
    } else {
        let mtfPacked: Uint8Array;
        if (version === 2) {
            mtfPacked = bytes.subarray(offset);
        } else {
            const packedLengthParsed = readVarint(bytes, offset);
            const packedLength = packedLengthParsed.value;
            offset = packedLengthParsed.offset;
            const entropyBytes = bytes.subarray(offset);
            mtfPacked = entropyDecodeBytes(entropyBytes, packedLength);
        }
        const mtfParsed = decodeMtfRle(mtfPacked, 0, tokenCount);
        mtf = mtfParsed.mtf;
    }

    return { dictionary, primaryIndex, mtf };
}
