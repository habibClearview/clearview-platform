// Stub — superseded by conas-engine.ts
export function fmt(n: number, cc = 'UGX'): string {
  return `${cc} ${Math.round(n).toLocaleString('en-US')}`
}
