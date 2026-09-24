import {
  runSupabase,
  startAndMigrateLocalSupabase,
} from "./supabase-local.mjs";

const args = process.argv.slice(2);
if (args.length === 0) {
  await startAndMigrateLocalSupabase();
} else if (args.length === 1 && args[0] === "--dev") {
  await runSupabase(["db", "push"]);
} else {
  throw new Error("Usage: pnpm migrate [--dev]");
}
