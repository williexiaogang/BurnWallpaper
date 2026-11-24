import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";

const prefix = "burn-sample-test-";
const quote = String.fromCharCode(96);
const code = (value) => quote + value + quote;

function setup(t, initialized = true) {
  const base = realpathSync(tmpdir());
  const root = mkdtempSync(join(base, prefix));
  t.after(() => {
    const target = realpathSync(root);
    assert.equal(dirname(target), base);
    assert.ok(basename(target).startsWith(prefix));
    rmSync(target, { recursive: true });
  });

  const sample = join(root, ".sample");
  const scripts = join(root, "scripts");
  mkdirSync(sample);
  mkdirSync(scripts);
  const script = join(scripts, "scan-samples.mjs");
  copyFileSync(new URL("./scan-samples.mjs", import.meta.url), script);
  const index = join(sample, "INDEX.md");
  const writeLedger = (text = "") => writeFileSync(index, "<!-- APPEND_BATCHES_HERE -->\n" + text + "\n<!-- APPEND_ROWS_HERE -->\n");
  if (initialized) writeLedger();

  return {
    add(path, content) {
      const target = join(sample, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      return createHash("sha256").update(content).digest("hex").slice(0, 12);
    },
    run: (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" }),
    hasLedger: () => existsSync(index),
    read: () => readFileSync(index, "utf8"),
    write: (text) => writeFileSync(index, text, "utf8"),
    writeLedger,
  };
}

test("a fresh checkout creates its local ledger on first registration", (t) => {
  const fixture = setup(t, false);
  const inventory = fixture.run("--json");
  assert.equal(inventory.status, 0, inventory.stderr);
  assert.equal(JSON.parse(inventory.stdout).registered, 0);
  assert.equal(fixture.hasLedger(), false);

  const batch = "2026-11-24-local";
  const hash = fixture.add("batches/" + batch + "/images/first.jpg", "first sample");
  const registration = fixture.run("--register", batch, hash);
  assert.equal(registration.status, 0, registration.stderr);
  assert.ok(fixture.read().includes(code(hash)));
  assert.ok(fixture.read().includes("<!-- APPEND_ROWS_HERE -->"));
});

test("registration checks the complete selection and keeps unrelated images out of the batch", (t) => {
  const fixture = setup(t);
  const first = "2026-11-24-first";
  const second = "2026-11-24-second";
  const firstHash = fixture.add("batches/" + first + "/images/first.jpg", "first");
  const secondHash = fixture.add("batches/" + second + "/images/second.PNG", "second");
  const unselectedHash = fixture.add("batches/" + second + "/images/not-selected.webp", "unselected");
  const inboxHash = fixture.add("inbox/next.gif", "new inbox file");
  const before = fixture.read();

  const oldInvocation = fixture.run("--register", second);
  assert.equal(oldInvocation.status, 1);
  assert.match(oldInvocation.stderr, /sha12/);
  const mismatched = fixture.run("--register", second, secondHash, firstHash);
  assert.equal(mismatched.status, 1);
  assert.match(mismatched.stderr, /images/);
  assert.equal(fixture.read(), before);

  const registered = fixture.run("--register", second, secondHash);
  assert.equal(registered.status, 0, registered.stderr);
  const text = fixture.read();
  assert.ok(text.includes(code(secondHash)));
  assert.ok(text.includes("batches/" + second + "/images/second.PNG"));
  for (const hash of [firstHash, unselectedHash, inboxHash]) assert.ok(!text.includes(code(hash)));
  assert.equal(fixture.run("--register", second, secondHash).status, 0);
  assert.equal(fixture.read(), text);

  const verified = text.replaceAll("pending", "verified");
  fixture.write(verified);
  assert.equal(fixture.run("--register", second, unselectedHash).status, 0);
  const updated = fixture.read();
  const summary = updated.split("\n").find((line) => line.startsWith("| " + code(second) + " |"));
  assert.ok(summary.includes("| 2026-11-24 | 2 |"));
  assert.ok(summary.includes("| pending |"));
  assert.ok(updated.includes(code(secondHash) + " | " + code("batches/" + second + "/images/second.PNG") + " | " + code(second) + " | verified |"));
});

test("inventory surfaces missing unfinished entries and known unsupported formats", (t) => {
  const fixture = setup(t);
  const missing = "123456789abc";
  const batch = "2026-11-24-absent";
  fixture.writeLedger("| " + code(missing) + " | " + code("missing.jpg") + " | " + code(batch) + " | pending | — | — |");
  fixture.add("inbox/unsupported.HEIC", "image");
  const result = fixture.run("--json");
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.stateCounts.pending, 1);
  assert.deepEqual(inventory.unfinished, [{ sha: missing, file: "missing.jpg", batch, status: "pending", paths: [] }]);
  assert.deepEqual(inventory.unsupported, ["inbox/unsupported.HEIC"]);
  assert.match(fixture.run().stdout, /原圖缺失/);
});
