import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

// Use the official CLI image so local webhooks do not depend on a globally
// installed binary. The API key travels through the child environment, never
// shell arguments; the signing secret is passed directly to the Next process.
export async function startLocalStripeListener(apiKey) {
  if (!apiKey?.startsWith("sk_test_"))
    throw new Error("Local Stripe forwarding requires a test-mode API key.");
  const name = `runly-stripe-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 10)}`;
  const args = [
    "run",
    "--rm",
    "--name",
    name,
    "-e",
    "STRIPE_API_KEY",
    "-e",
    "STRIPE_CLI_TELEMETRY_OPTOUT=1",
  ];
  if (process.platform === "linux")
    args.push("--add-host=host.docker.internal:host-gateway");
  args.push(
    "stripe/stripe-cli:v1.54.0",
    "listen",
    "--device-name",
    name,
    "--events",
    "customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,invoice.payment_failed",
    "--forward-to",
    "http://host.docker.internal:3000/api/stripe/webhook",
  );
  const child = spawn("docker", args, {
    env: { ...process.env, STRIPE_API_KEY: apiKey },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let closed = false;
  let settled = false;
  let buffer = "";
  const stop = () => {
    if (closed) return;
    closed = true;
    spawn("docker", ["stop", "--time", "5", name], {
      stdio: "ignore",
      windowsHide: true,
    }).on("error", () => {});
    child.kill();
  };
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        stop();
        reject(
          new Error(
            "Stripe forwarding did not become ready. Check Docker networking and the test key, then restart.",
          ),
        );
      }
    }, 90000);
    function consume(chunk) {
      buffer = (buffer + chunk.toString()).slice(-12000);
      const match = buffer.match(/whsec_[A-Za-z0-9]+/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(match[0]);
      }
      // Never relay raw CLI output: it contains the webhook signing secret.
    }
    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
    child.on("error", () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(
          new Error("Docker could not launch the local Stripe forwarder."),
        );
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(
          new Error(
            `Stripe forwarding exited (${code ?? "signal"}). Check your test key and Docker connectivity.`,
          ),
        );
      } else if (!closed)
        console.error(
          "Stripe forwarding stopped. Restart pnpm dev:stripe to restore local webhook delivery.",
        );
    });
  });
  try {
    return { signingSecret: await ready, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
