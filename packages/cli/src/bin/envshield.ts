#!/usr/bin/env node
import { Command } from 'commander';
import { installCommand } from '../commands/install.js';
import { scanCommand } from '../commands/scan.js';
import { scanHistoryCommand } from '../commands/scanHistory.js';

const program = new Command();

program
  .name('envshield')
  .description('Detect secrets and leaked credentials in your codebase — fully offline')
  .version('0.0.1')
  .addHelpText(
    'after',
    `
Examples:
  $ envshield install               Install git hooks in the current repo
  $ envshield scan                  Scan staged changes (used by pre-commit hook)
  $ envshield scan --entropy        Scan staged changes + entropy analysis
  $ envshield scan-history          Scan full git history for leaked secrets
  $ envshield scan-history --since "6 months ago"
`,
  );

installCommand(program);
scanCommand(program);
scanHistoryCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
