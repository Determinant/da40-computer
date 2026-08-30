interface JsonUrlCodec {
  compress(value: Record<string, unknown>): Promise<string>;
  decompress(value: string): Promise<Record<string, unknown>>;
}

interface Window {
  clipboardData?: DataTransfer;
}

declare function JsonUrl(algorithm: "lzma"): JsonUrlCodec;
