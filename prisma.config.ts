import { defineConfig, env } from 'prisma/config';

// Prisma 7 reads the datasource URL from here rather than from env() inside
// schema.prisma. .env.local is loaded explicitly because Prisma's CLI only
// picks up .env by default.
try {
  process.loadEnvFile('.env.local');
} catch {
  /* fall back to the ambient environment */
}

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
});
