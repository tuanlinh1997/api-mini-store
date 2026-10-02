import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import { DatabaseConnection } from './database-url';

export type MysqlTool = 'mysqldump' | 'mysql';

const TOOL_ENV_VARIABLES: Record<MysqlTool, string> = {
  mysqldump: 'MYSQLDUMP_PATH',
  mysql: 'MYSQL_PATH',
};

/** The binary from MYSQLDUMP_PATH / MYSQL_PATH when set, otherwise the bare name from PATH. */
export function resolveToolPath(tool: MysqlTool, env: NodeJS.ProcessEnv): string {
  const configured = env[TOOL_ENV_VARIABLES[tool]]?.trim();
  return configured ? configured : tool;
}

/** Connection flags without the password: that travels in MYSQL_PWD, never on the command line. */
export function connectionArguments(connection: DatabaseConnection): string[] {
  return [`--host=${connection.host}`, `--port=${connection.port}`, `--user=${connection.user}`];
}

function toolEnvironment(connection: DatabaseConnection): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  if (connection.password) {
    environment.MYSQL_PWD = connection.password;
  } else {
    delete environment.MYSQL_PWD;
  }
  return environment;
}

export interface ToolRun {
  /** Resolves when the process exits with code 0; rejects with its stderr otherwise. */
  completed: Promise<void>;
  stdin: Writable;
  stdout: Readable;
}

export function runTool(
  tool: MysqlTool,
  args: readonly string[],
  connection: DatabaseConnection,
): ToolRun {
  const executable = resolveToolPath(tool, process.env);
  const child = spawn(executable, [...args], {
    env: toolEnvironment(connection),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const stderrChunks: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const completed = new Promise<void>((resolve, reject) => {
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(
              `Cannot find "${executable}". Put ${tool} on PATH or set ${TOOL_ENV_VARIABLES[tool]} to its full path.`,
            )
          : error,
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(`${tool} exited with code ${code}: ${stderr || '(no error output)'}`));
    });
  });
  // Avoid an unhandled rejection while the caller is still piping and the tool fails early.
  completed.catch(() => undefined);
  return { completed, stdin: child.stdin, stdout: child.stdout };
}
