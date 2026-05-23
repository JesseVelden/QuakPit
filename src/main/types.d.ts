// Ambient type for node-machine-id (ships without bundled types).
declare module 'node-machine-id' {
  export function machineIdSync(original?: boolean): string
  export function machineId(original?: boolean): Promise<string>
}
