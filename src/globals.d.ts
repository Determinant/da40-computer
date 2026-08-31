interface JsonUrlCodec {
  compress(value: Record<string, unknown>): Promise<string>;
  decompress(value: string): Promise<Record<string, unknown>>;
}

interface Navigator {
  readonly standalone?: boolean;
}

declare function JsonUrl(algorithm: "lzma"): JsonUrlCodec;
