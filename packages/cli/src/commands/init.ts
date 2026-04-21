import { writeFile } from 'node:fs/promises';

export async function runInit(targetDir: string): Promise<void> {
  const config = `export default {
  original: 'https://example.com/*',
  updated: 'https://staging.example.com/*',
};
`;
  await writeFile(`${targetDir}/visidiff.config.js`, config, 'utf8');
}
