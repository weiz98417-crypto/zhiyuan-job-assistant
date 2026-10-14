export interface ErasureWitness {
  requestId: number;
  userId: string;
  targetHash: string;
  canonicalText: string;
}

export interface CompletedErasureIdentity {
  id: number | string;
  user_id: string;
  target_hash: string;
}

export function memoryRestoreContentHash(content: string): string;
export function readErasureWitnesses(filePath: string): ErasureWitness[];
export function bindErasureWitnesses(witnesses: ErasureWitness[], requests: CompletedErasureIdentity[]): Map<number, string>;
