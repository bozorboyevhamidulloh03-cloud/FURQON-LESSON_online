export type FurErrorCode = 'NOT_ZIP' | 'CORRUPT' | 'MISSING' | 'CHECKSUM' | 'UNSUPPORTED_VERSION' | 'INVALID' | 'UNSAFE' | 'TOO_LARGE';
export class FurError extends Error {
  constructor(public code: FurErrorCode, message: string) { super(message); this.name = 'FurError'; }
}
