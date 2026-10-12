// Hypothetical users pressing Update now, each with a different setup or problem.
// The updater runs for real against a pretend folder, GitHub, folder picker and antivirus (tests/update-env.js).
import assert from "node:assert/strict";
import test from "node:test";
import { FakeDir, crlf, filesOf, folderWith, makeUser, manifestText, read } from "./update-env.js";

const MANIFEST = { name: "Crunchilist", version: "1.0.108", content_scripts: [{ js: ["content/crunchilist.js"] }] };
const OLD = {
  "manifest.json": manifestText(MANIFEST),
  "app/app.html": "<main></main>\n",
  "app/prism.js": "render(1);\n",
  "app/old.js": "retired();\n",
  "app/updater.js": "update(1);\n",
  "lib/a.js": "export const a = 1;\n",
  "options/options.html": "<form></form>\n",
  "options/options.js": "save();\n",
  "content/crunchilist.js": "bundle(1);\n",
};
const NEXT_MANIFEST = { ...MANIFEST, version: "1.0.112", externally_connectable: { matches: ["http://localhost/*"] } };
const NEXT = {
  "manifest.json": JSON.stringify(NEXT_MANIFEST),
  "app/app.html": "<main></main>\n",
  "app/prism.js": "render(2);\n",
  "app/updater.js": "update(1);\n",
  "app/panel/panel.js": "panel();\n",
  "lib/a.js": "export const a = 1;\n",
  "options/options.html": "<form></form>\n",
  "options/options.js": "save();\n",
  "content/crunchilist.js": "bundle(2);\n",
  "content/main.js": "source();\n",
  "scripts/package.mjs": "dev();\n",
};
const windowsCopy = (files) => Object.fromEntries(Object.entries(files).map(([path, text]) => [path, path === "manifest.json" ? text : crlf(text)]));
const untouched = async (user) => {
  assert.equal(await user.version(), "1.0.108");
  assert.equal(await read(user.dir, "app/prism.js"), "render(1);\n");
  assert.equal(user.env.log.filter((path) => !path.includes(".crunchilist-update")).length, 0, `wrote ${user.env.log.join(", ")}`);
  assert.ok(!user.dir.children.has(".crunchilist-update"), "staging folder left behind");
};

test("Mia, a Windows zip user a few versions behind: only real changes are written and her own files stay", async () => {
  const user = await makeUser({ installed: { ...windowsCopy(OLD), "notes.txt": "my notes", "dev/scratch.js": "mine();" }, repo: NEXT });
  const result = await user.update();
  assert.deepEqual(result, { version: "1.0.112", changed: 3 });
  assert.equal(await read(user.dir, "app/prism.js"), "render(2);\n");
  assert.equal(await read(user.dir, "app/panel/panel.js"), "panel();\n");
  assert.equal(await read(user.dir, "content/crunchilist.js"), "bundle(2);\n");
  assert.equal(await read(user.dir, "app/old.js"), null);
  assert.equal(await read(user.dir, "lib/a.js"), crlf("export const a = 1;\n"), "unchanged files keep their Windows line endings");
  assert.ok(!user.env.log.some((path) => path.endsWith("app/updater.js")), "updater.js is not rewritten when it didn't change");
  assert.equal(await read(user.dir, "notes.txt"), "my notes");
  assert.equal(await read(user.dir, "dev/scratch.js"), "mine();");
  assert.equal(await read(user.dir, "content/main.js"), null);
  assert.equal(await read(user.dir, "scripts/package.mjs"), null);
  assert.equal(user.env.log.at(-1), "manifest.json");
  const manifest = JSON.parse(await read(user.dir, "manifest.json"));
  assert.equal(manifest.version, "1.0.112");
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(user.remembered.sets, 1, "the folder is remembered for next time");
});

test("Jon picks the copy in his Downloads folder instead of the one Chrome loaded", async () => {
  const user = await makeUser({
    installed: OLD,
    repo: NEXT,
    picker: async (env) => folderWith(env, { ...OLD, "manifest.json": manifestText({ ...MANIFEST, version: "1.0.100" }) }),
  });
  await assert.rejects(user.update(), { code: "folder", message: /chrome:\/\/extensions/ });
  await untouched(user);
  assert.equal(user.remembered.value, null, "the wrong folder is not remembered");
});

test("Priya runs Crunchilist from a git clone", async () => {
  const user = await makeUser({ installed: { ...OLD, ".git/HEAD": "ref: refs/heads/master" }, repo: NEXT });
  await assert.rejects(user.update(), { code: "git", message: /git pull/ });
  await untouched(user);
});

test("Sam's release changes updater.js and his antivirus quarantines it", async () => {
  const repo = { ...NEXT, "app/updater.js": "update(2);\n" };
  const user = await makeUser({ installed: OLD, repo, faults: { quarantine: (path) => path.endsWith("app/updater.js") } });
  await assert.rejects(user.update(), { code: "blocked", message: /app\/updater\.js.*Download instead/ });
  await untouched(user);
  assert.equal(await read(user.dir, "app/updater.js"), "update(1);\n");
});

test("Lee's Wi-Fi drops halfway through the download", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, faults: { offlineAfter: 2 } });
  await assert.rejects(user.update(), { code: "network", message: /connection/ });
  await untouched(user);
});

test("Ana has hit GitHub's hourly request limit", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, faults: { api: 403 } });
  await assert.rejects(user.update(), { code: "network", message: /limit/i });
  await untouched(user);
});

test("Kai opens the folder picker and closes it", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, picker: async () => { throw Object.assign(new Error("The user aborted a request."), { name: "AbortError" }); } });
  await assert.rejects(user.update(), { code: "canceled", message: "Update canceled." });
  await untouched(user);
});

test("Rosa turned off folder access in Chrome's site settings since her last update", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, permission: "denied" });
  user.env.permission = "denied";
  const remembered = user.dir;
  user.remembered.value = remembered;
  let picked = 0;
  globalThis.window.showDirectoryPicker = async () => { picked += 1; user.env.permission = "granted"; return user.dir; };
  assert.equal((await user.update()).version, "1.0.112");
  assert.equal(picked, 1, "she is asked to pick the folder again");
  assert.equal(user.remembered.forgets, 1);
});

test("Tom moved his Crunchilist folder, so the remembered one is empty now", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT });
  user.remembered.value = new FakeDir(user.env, "old-place/");
  assert.equal((await user.update()).version, "1.0.112");
  assert.equal(user.remembered.forgets, 1);
  assert.equal(user.remembered.value, user.dir);
});

test("Eve's notice is stale: GitHub has nothing newer than what she runs", async () => {
  const user = await makeUser({ installed: OLD, repo: { ...NEXT, "manifest.json": JSON.stringify(MANIFEST) } });
  await assert.rejects(user.update(), { code: "current" });
  await untouched(user);
});

test("Ben's disk fills up while the files are being installed", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, faults: { full: "content/crunchilist.js" } });
  await assert.rejects(user.update(), { code: "failed", message: /disk/i });
  assert.equal(await user.version(), "1.0.108");
  assert.equal(await read(user.dir, "app/prism.js"), "render(1);\n", "files already written are put back");
  assert.equal(await read(user.dir, "app/panel/panel.js"), null, "new files are removed again");
  assert.equal(await read(user.dir, "app/old.js"), "retired();\n");
});

test("Zoe's network hands back a corrupted file", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, faults: { tamper: "app/prism.js" } });
  await assert.rejects(user.update(), { code: "integrity", message: /app\/prism\.js/ });
  await untouched(user);
});

test("Raj's first try is interrupted by his antivirus; pressing Update again finishes it", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, faults: { quarantine: (path) => path === "app/prism.js", once: true } });
  await assert.rejects(user.update(), { code: "blocked" });
  assert.equal(await user.version(), "1.0.108");
  assert.equal(await read(user.dir, "app/prism.js"), "render(1);\n");
  assert.equal((await user.update()).version, "1.0.112");
  assert.equal(await read(user.dir, "app/prism.js"), "render(2);\n");
});

test("Nora's saved notice is from before versions carried a source", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT });
  assert.equal((await user.update({ version: "1.0.112" })).version, "1.0.112");
});

test("Leo uses Brave, which switches folder access off, and Kim installed from a store", async () => {
  const brave = await makeUser({ installed: OLD, repo: NEXT, browser: { window: { showDirectoryPicker: undefined } } });
  assert.equal(brave.updater.canSelfUpdate(), false);
  const store = await makeUser({ installed: OLD, repo: NEXT, browser: { manifest: { update_url: "https://clients2.google.com/service/update2/crx" } } });
  assert.equal(store.updater.canSelfUpdate(), false);
  const plain = await makeUser({ installed: OLD, repo: NEXT });
  assert.equal(plain.updater.canSelfUpdate(), true);
});

test("Ivy's new version drops the whole options page", async () => {
  const repo = { ...NEXT };
  delete repo["options/options.html"];
  delete repo["options/options.js"];
  const user = await makeUser({ installed: OLD, repo });
  await user.update();
  assert.equal(await read(user.dir, "options/options.html"), null);
  assert.equal(await read(user.dir, "options/options.js"), null);
});

test("Max's browser crashed mid-update last time and left the staging folder behind", async () => {
  const user = await makeUser({ installed: { ...OLD, ".crunchilist-update/app/prism.js": "half-written" }, repo: NEXT });
  assert.equal((await user.update()).version, "1.0.112");
  assert.ok(!user.dir.children.has(".crunchilist-update"));
});

test("Every user sees what the updater is doing", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT });
  await user.update();
  assert.ok(user.steps.some((step) => /^Downloading \d+ of \d+/.test(step)));
  assert.ok(user.steps.includes("Installing…"));
});

test("Owen updates through three releases in a row", async () => {
  let installed = { ...windowsCopy(OLD), "notes.txt": "mine" };
  const releases = [
    ["1.0.112", NEXT],
    ["1.0.113", { ...NEXT, "app/prism.js": "render(3);\n", "lib/b.js": "b();\n" }],
    ["1.0.114", { ...NEXT, "app/prism.js": "render(4);\n" }],
  ];
  for (const [version, files] of releases) {
    const user = await makeUser({ installed, repo: { ...files, "manifest.json": JSON.stringify({ ...MANIFEST, version }) } });
    assert.equal((await user.update()).version, version);
    installed = await filesOf(user.dir);
  }
  assert.equal(installed["app/prism.js"], "render(4);\n");
  assert.equal(installed["lib/b.js"], undefined, "added in one release and dropped in the next");
  assert.equal(installed["notes.txt"], "mine");
  const again = await makeUser({ installed, repo: { ...releases[2][1], "manifest.json": JSON.stringify({ ...MANIFEST, version: "1.0.114" }) } });
  await assert.rejects(again.update(), { code: "current" });
});

test("Pia's laptop died halfway through installing; Update finishes the job", async () => {
  const half = { ...OLD, "app/prism.js": NEXT["app/prism.js"], "app/panel/panel.js": NEXT["app/panel/panel.js"] };
  const user = await makeUser({ installed: half, repo: NEXT });
  assert.deepEqual(await user.update(), { version: "1.0.112", changed: 1 });
  assert.equal(await read(user.dir, "content/crunchilist.js"), "bundle(2);\n");
  assert.equal(await read(user.dir, "app/old.js"), null);
});

test("Lee tries again once his Wi-Fi is back", async () => {
  const faults = { offlineAfter: 1 };
  const user = await makeUser({ installed: OLD, repo: NEXT, faults });
  await assert.rejects(user.update(), { code: "network" });
  faults.offlineAfter = null;
  assert.equal((await user.update()).version, "1.0.112");
});

test("Gus has Crunchilist open in two tabs and presses Update in both", async () => {
  const user = await makeUser({ installed: OLD, repo: NEXT, slowWrites: 5 });
  const results = await Promise.allSettled([user.update(), user.update()]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected"]);
  assert.equal(results[1].reason.code, "busy");
  assert.match(results[1].reason.message, /another Crunchilist tab/);
  assert.equal(await user.version(), "1.0.112");
  assert.equal(await read(user.dir, "app/prism.js"), "render(2);\n");
  assert.equal(await read(user.dir, "app/old.js"), null);
  assert.ok(!user.dir.children.has(".crunchilist-update"));
});
