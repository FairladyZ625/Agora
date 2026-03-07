import { Command } from 'commander';

const program = new Command();

program
  .name('agora-ts')
  .description('Agora v2 TypeScript CLI bootstrap')
  .version('0.0.0');

program
  .command('health')
  .description('Print the bootstrap health marker')
  .action(() => {
    process.stdout.write('agora-ts bootstrap ok\n');
  });

program.parse();
