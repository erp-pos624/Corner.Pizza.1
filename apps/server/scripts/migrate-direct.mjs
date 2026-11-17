import { spawn } from 'node:child_process';
import { config } from 'dotenv';

config();

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  console.error(
    '[db:deploy:direct] DIRECT_URL is not set. Use the Supabase session/direct connection (port 5432) for migrations.',
  );
  process.exit(1);
}

// Prisma migrate needs a non-pooled connection; the API itself runs on the
// transaction pooler configured in DATABASE_URL.
const child = spawn('prisma', ['migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, DATABASE_URL: directUrl },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
