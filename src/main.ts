/**
 * Entry point: terminal REPL for the AI agent.
 */

import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, TAVILY_API_KEY, MODEL } from './config.js';
import { runAgent } from './loop.js';
import { initFileLog, logUserInput, logAgentOutput } from './logger.js';
import { setConfirmFn } from './confirm.js';

const BANNER = `
${chalk.bold.cyan('AI Agent')} ${chalk.dim('— powered by Claude')}
${chalk.dim('Commands:')} ${chalk.bold('/exit')} quit · ${chalk.bold('/clear')} clear history · ${chalk.bold('/help')} show tools
`;

const HELP = `
${chalk.bold('Available tools:')}
  ${chalk.cyan('read_file')}        Read a file
  ${chalk.cyan('write_file')}       Write / create a file
  ${chalk.cyan('edit_file')}        Edit part of a file
  ${chalk.cyan('delete_file')}      Delete a file ${chalk.dim('(with confirmation)')}
  ${chalk.cyan('list_directory')}   List directory contents
  ${chalk.cyan('execute_command')}  Run a shell command
  ${chalk.cyan('web_search')}       Search the web ${chalk.dim('(Tavily)')}
  ${chalk.cyan('web_fetch')}        Fetch a web page
  ${chalk.cyan('memory_read')}      Read long-term memory
  ${chalk.cyan('memory_write')}     Save to long-term memory
`;

function checkEnv(): void {
  if (!ANTHROPIC_API_KEY) {
    console.warn(chalk.yellow('Warning: ANTHROPIC_API_KEY is not set'));
  }
  if (!TAVILY_API_KEY) {
    console.warn(chalk.yellow('Warning: TAVILY_API_KEY is not set (web search unavailable)'));
  }
}

async function main(): Promise<void> {
  checkEnv();
  const logFile = initFileLog();
  console.log(BANNER);
  console.log(chalk.dim(`Model: ${MODEL}`));
  console.log(chalk.dim(`Session log: ${logFile}\n`));

  const rl = readline.createInterface({ input, output });
  setConfirmFn(async (message) => {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  });
  const messages: Anthropic.MessageParam[] = [];

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    console.log(chalk.dim('\nGoodbye.'));
    process.exit(0);
  });

  while (true) {
    let userInput: string;
    try {
      userInput = (await rl.question(chalk.cyan.bold('you › '))).trim();
    } catch {
      break;
    }

    if (!userInput) continue;

    // Built-in commands
    if (userInput === '/exit') {
      console.log(chalk.dim('Goodbye.'));
      break;
    }
    if (userInput === '/clear') {
      messages.length = 0;
      console.log(chalk.dim('Conversation history cleared.'));
      continue;
    }
    if (userInput === '/help') {
      console.log(HELP);
      continue;
    }

    messages.push({ role: 'user', content: userInput });
    logUserInput(userInput);

    process.stdout.write(`\n${chalk.bold.cyan('agent')} › `);

    let agentOutput = '';
    try {
      await runAgent(messages, (chunk) => {
        process.stdout.write(chunk);
        agentOutput += chunk;
      });
      logAgentOutput(agentOutput);
    } catch (e: any) {
      console.error(`\n${chalk.red('Error:')} ${e.message}`);
      // Remove the failed user turn to keep history clean
      if (messages.at(-1)?.role === 'user') messages.pop();
    }

    console.log('\n');
  }

  rl.close();
}

main();
