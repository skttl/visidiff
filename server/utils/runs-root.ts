import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function getRunsRoot(): string {
  const outputPublic = join(process.cwd(), '.output', 'public')
  if (existsSync(outputPublic)) return join(outputPublic, 'runs')
  return join(process.cwd(), 'public', 'runs')
}
