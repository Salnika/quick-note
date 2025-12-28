import { useMemo, useState } from 'preact/hooks';
import LZString from 'lz-string';
import { serializeWBWT, wbwtCompress } from './lib/wbwt';

type SampleSet = {
    id: string;
    label: string;
    text: string;
};

const SAMPLE_SETS: SampleSet[] = [
    {
        id: 'markdown',
        label: 'Sample Markdown',
        text: '# Notes\n\nThis is a short markdown note.\n\n- Repeated words help compression.\n- Repeated words help compression.\n- Repeated words help compression.\n\n## Another section\n\nWords and words and words, plus punctuation.'
    },
    {
        id: 'lorem',
        label: 'Sample Lorem',
        text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec quis lorem ipsum. Integer lorem ipsum.'
    },
    {
        id: 'dialog',
        label: 'Sample Dialog',
        text: 'Alice: We need to test word-based BWT.\nBob: Words repeat in natural language.\nAlice: Words repeat in natural language.\nBob: Exactly. Words repeat.'
    }
];

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(ms: number): string {
    return `${ms.toFixed(2)} ms`;
}

function formatRatio(outBytes: number, inBytes: number): string {
    if (!inBytes) return '0.000';
    return (outBytes / inBytes).toFixed(3);
}

function summarizeMtf(mtf: Uint32Array | null) {
    if (!mtf || mtf.length === 0) {
        return { zeroRatio: 0, smallRatio: 0 };
    }

    let zeros = 0;
    let small = 0;
    for (let i = 0; i < mtf.length; i++) {
        const value = mtf[i];
        if (value === 0) zeros++;
        if (value <= 3) small++;
    }

    return {
        zeroRatio: zeros / mtf.length,
        smallRatio: small / mtf.length
    };
}

async function gzipEncode(bytes: Uint8Array): Promise<Uint8Array | null> {
    if (typeof CompressionStream === 'undefined') return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
}

type BenchmarkProps = {
    getText: () => string;
};

type BenchmarkResults = {
    inputBytes: number;
    lzBytes: number;
    lzTime: number;
    wbwtBytes: number;
    wbwtTime: number;
    gzipInputBytes: number | null;
    gzipInputTime: number | null;
    gzipWbwtBytes: number | null;
    gzipWbwtTime: number | null;
    tokenCount: number;
    dictSize: number;
    zeroRatio: number;
    smallRatio: number;
};

export function Benchmark({ getText }: BenchmarkProps) {
    const initialText = useMemo(() => getText(), [getText]);
    const [input, setInput] = useState(initialText);
    const [selectedSample, setSelectedSample] = useState('custom');
    const [results, setResults] = useState<BenchmarkResults | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const gzipAvailable = typeof CompressionStream !== 'undefined';

    const applySample = (sampleId: string) => {
        setSelectedSample(sampleId);
        if (sampleId === 'custom') {
            setResults(null);
            return;
        }
        const sample = SAMPLE_SETS.find((entry) => entry.id === sampleId);
        if (!sample) return;
        setInput(sample.text);
        setResults(null);
    };

    const useCurrentNote = () => {
        setInput(getText());
        setSelectedSample('custom');
        setResults(null);
    };

    const runBenchmark = async () => {
        if (isRunning) return;
        setIsRunning(true);

        try {
            const encoder = new TextEncoder();
            const inputBuffer = encoder.encode(input);
            const inputBytes = inputBuffer.length;

            const lzStart = performance.now();
            const lzBytes = LZString.compressToUint8Array(input);
            const lzTime = performance.now() - lzStart;

            const wbwtStart = performance.now();
            const wbwtPayload = wbwtCompress(input);
            const wbwtPacked = serializeWBWT(wbwtPayload);
            const wbwtTime = performance.now() - wbwtStart;

            let gzipInputBytes = null;
            let gzipInputTime = null;
            let gzipWbwtBytes = null;
            let gzipWbwtTime = null;

            if (gzipAvailable) {
                const gzipInputStart = performance.now();
                const gzipInput = await gzipEncode(inputBuffer);
                gzipInputTime = performance.now() - gzipInputStart;
                gzipInputBytes = gzipInput ? gzipInput.length : null;

                const gzipWbwtStart = performance.now();
                const gzipWbwt = await gzipEncode(wbwtPacked);
                gzipWbwtTime = performance.now() - gzipWbwtStart;
                gzipWbwtBytes = gzipWbwt ? gzipWbwt.length : null;
            }

            const { zeroRatio, smallRatio } = summarizeMtf(wbwtPayload.mtf);

            setResults({
                inputBytes,
                lzBytes: lzBytes.length,
                lzTime,
                wbwtBytes: wbwtPacked.length,
                wbwtTime,
                gzipInputBytes,
                gzipInputTime,
                gzipWbwtBytes,
                gzipWbwtTime,
                tokenCount: wbwtPayload.mtf.length,
                dictSize: wbwtPayload.dictionary.length,
                zeroRatio,
                smallRatio
            });
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div id="benchmark">
            <div className="bench-hero">
                <div className="bench-title">Benchmark WBWT + MTF</div>
                <div className="bench-sub">
                    Compare une compression LZ (LZString) a un pipeline WBWT + MTF avec front-coding, RUNA/RUNB et codage entropique.
                </div>
            </div>

            <div className="bench-actions">
                <select
                    className="bench-select"
                    value={selectedSample}
                    onChange={(event) => applySample(event.currentTarget.value)}
                >
                    <option value="custom">Texte libre</option>
                    {SAMPLE_SETS.map((sample) => (
                        <option key={sample.id} value={sample.id}>{sample.label}</option>
                    ))}
                </select>
                <button className="btn" onClick={useCurrentNote}>Utiliser la note</button>
                <button className="btn primary" onClick={runBenchmark} disabled={isRunning}>
                    {isRunning ? 'Benchmark...' : 'Lancer le benchmark'}
                </button>
            </div>

            <textarea
                className="bench-input"
                value={input}
                onInput={(event) => {
                    setInput(event.currentTarget.value);
                    setSelectedSample('custom');
                }}
                placeholder="Collez un texte pour mesurer la compression."
            />

            {results && (
                <>
                    <div className="bench-results">
                        <div className="bench-card">
                            <div className="bench-card-title">Taille</div>
                            <div className="bench-metric">
                                <span className="bench-label">Input</span>
                                <span className="bench-value">{formatBytes(results.inputBytes)}</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">LZString</span>
                                <span className="bench-value">{formatBytes(results.lzBytes)}</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">WBWT + MTF + Range</span>
                                <span className="bench-value">{formatBytes(results.wbwtBytes)}</span>
                            </div>
                            {results.gzipInputBytes !== null && (
                                <div className="bench-metric">
                                    <span className="bench-label">GZIP (Deflate)</span>
                                    <span className="bench-value">{formatBytes(results.gzipInputBytes)}</span>
                                </div>
                            )}
                            {results.gzipWbwtBytes !== null && (
                                <div className="bench-metric">
                                    <span className="bench-label">WBWT + MTF + Range + GZIP</span>
                                    <span className="bench-value">{formatBytes(results.gzipWbwtBytes)}</span>
                                </div>
                            )}
                        </div>

                        <div className="bench-card">
                            <div className="bench-card-title">Ratio (sortie / entree)</div>
                            <div className="bench-metric">
                                <span className="bench-label">LZString</span>
                                <span className="bench-value">{formatRatio(results.lzBytes, results.inputBytes)}</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">WBWT + MTF + Range</span>
                                <span className="bench-value">{formatRatio(results.wbwtBytes, results.inputBytes)}</span>
                            </div>
                            {results.gzipInputBytes !== null && (
                                <div className="bench-metric">
                                    <span className="bench-label">GZIP (Deflate)</span>
                                    <span className="bench-value">{formatRatio(results.gzipInputBytes, results.inputBytes)}</span>
                                </div>
                            )}
                            {results.gzipWbwtBytes !== null && (
                                <div className="bench-metric">
                                    <span className="bench-label">WBWT + MTF + Range + GZIP</span>
                                    <span className="bench-value">{formatRatio(results.gzipWbwtBytes, results.inputBytes)}</span>
                                </div>
                            )}
                        </div>

                        <div className="bench-card">
                            <div className="bench-card-title">Temps</div>
                            <div className="bench-metric">
                                <span className="bench-label">LZString</span>
                                <span className="bench-value">{formatMs(results.lzTime)}</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">WBWT + MTF + Range</span>
                                <span className="bench-value">{formatMs(results.wbwtTime)}</span>
                            </div>
                            {results.gzipInputTime !== null && (
                                <div className="bench-metric">
                                    <span className="bench-label">GZIP (Deflate)</span>
                                    <span className="bench-value">{formatMs(results.gzipInputTime)}</span>
                                </div>
                            )}
                            {results.gzipWbwtTime !== null && (
                                <div className="bench-metric">
                                    <span className="bench-label">WBWT + MTF + Range + GZIP</span>
                                    <span className="bench-value">{formatMs(results.gzipWbwtTime)}</span>
                                </div>
                            )}
                        </div>

                        <div className="bench-card">
                            <div className="bench-card-title">WBWT Stats</div>
                            <div className="bench-metric">
                                <span className="bench-label">Tokens</span>
                                <span className="bench-value">{results.tokenCount}</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">Dictionnaire</span>
                                <span className="bench-value">{results.dictSize}</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">MTF zeros</span>
                                <span className="bench-value">{(results.zeroRatio * 100).toFixed(1)}%</span>
                            </div>
                            <div className="bench-metric">
                                <span className="bench-label">{'MTF <= 3'}</span>
                                <span className="bench-value">{(results.smallRatio * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="bench-note">
                        {gzipAvailable
                            ? 'Conseil: GZIP sur le flux range n\'apporte presque rien; compare surtout WBWT + MTF + Range face a Deflate.'
                            : 'CompressionStream indisponible: essaye un navigateur recent pour activer GZIP.'}
                    </div>
                </>
            )}
        </div>
    );
}
