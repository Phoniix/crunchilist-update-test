// update.cmd / tools/update.ps1: the manual update, run for real against throwaway folders (Windows only).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PACKAGE_FOLDERS, PACKAGE_ROOT_FILES } from "../lib/update-files.js";
import { zip } from "../scripts/package.mjs";

const SCRIPT = path.resolve(import.meta.dirname, "../tools/update.ps1");
const windows = { skip: process.platform !== "win32" && "update.cmd is Windows only" };

const manifest = (version, extra = {}) => `${JSON.stringify({ manifest_version: 3, name: "Crunchilist", version, content_scripts: [{ matches: ["https://www.crunchyroll.com/*"], js: ["content/crunchilist.js"] }], ...extra }, null, 2)}\n`;
const crlf = (text) => text.replace(/\n/g, "\r\n");
const OLD = {
  "manifest.json": manifest("1.0.111"),
  "update.cmd": crlf("@echo off\r\n"),
  "tools/update.ps1": crlf("# old\n"),
  "app/app.html": crlf("<main></main>\n"),
  "app/prism.js": crlf("render(1);\n"),
  "app/old.js": crlf("retired();\n"),
  "lib/a.js": crlf("export const a = 1;\n"),
  "ui/z.js": crlf("z(1);\n"),
  "content/crunchilist.js": crlf("bundle(1);\n"),
};
const NEXT = {
  "manifest.json": manifest("1.0.112", { externally_connectable: { matches: ["http://localhost/*"] } }),
  "update.cmd": "@echo off\n",
  "tools/update.ps1": "# old\n",
  "app/app.html": "<main></main>\n",
  "app/prism.js": "render(2);\n",
  "app/panel/panel.js": "panel();\n",
  "lib/a.js": "export const a = 1;\n",
  "ui/z.js": "z(2);\n",
  "content/crunchilist.js": "bundle(2);\n",
};

async function folder(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cl-manual-"));
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), text);
  }
  return dir;
}

async function zipOf(files, top = "") {
  const out = path.join(await mkdtemp(path.join(os.tmpdir(), "cl-manual-zip-")), "next.zip");
  await writeFile(out, zip(Object.entries(files).map(([name, text]) => ({ name: `${top}${name}`, data: Buffer.from(text) }))));
  return out;
}

function run(root, archive, ...args) {
  return new Promise((resolve) => {
    const source = archive ? ["-Zip", archive] : [];
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Root", root, ...source, "-NoPause", "-SettleMs", "0", ...args], { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, out: `${stdout}${stderr}` });
    });
  });
}

// Plays api.github.com and codeload.github.com. release: a tag, or an HTTP status / "drop"; download: zip bytes, or a status / "drop" / "cut".
const COMMIT = "c".repeat(40);
async function fakeGitHub({ release = 404, download, commit = COMMIT }) {
  const hits = [];
  const server = http.createServer((request, response) => {
    hits.push(request.url);
    if (request.url.includes("/commits/")) return commit === "drop" ? request.socket.destroy() : response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ sha: commit }));
    const answer = request.url.startsWith("/repos/") ? release : download;
    if (answer === "drop") return request.socket.destroy();
    if (typeof answer === "number") return response.writeHead(answer).end();
    if (typeof answer === "string") return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ tag_name: answer }));
    if (download.cut) {
      response.writeHead(200, { "content-length": download.bytes.length });
      return response.write(download.bytes.subarray(0, download.bytes.length >> 1), () => request.socket.destroy());
    }
    response.writeHead(200, { "content-type": "application/zip" }).end(answer);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { hits, args: ["-ApiBase", base, "-ZipBase", base], close: () => new Promise((resolve) => server.close(resolve)) };
}
const sourceZip = (files) => zip(Object.entries(files).map(([name, data]) => ({ name: `crunchilist-master/${name}`, data: Buffer.from(data) })));

const text = (dir, file) => readFile(path.join(dir, file), "utf8").catch(() => null);
const version = async (dir) => JSON.parse(await text(dir, "manifest.json")).version;
const cleanup = (...paths) => Promise.all(paths.map((target) => rm(path.dirname(target).includes("cl-manual-zip-") ? path.dirname(target) : target, { recursive: true, force: true })));

test("the script ships the same file lists as the updater and package", async () => {
  const source = await readFile(SCRIPT, "utf8");
  const list = (name) => JSON.parse(`[${source.match(new RegExp(`^\\$${name} = @\\((.*)\\)$`, "m"))[1]}]`);
  assert.deepEqual(list("Folders"), PACKAGE_FOLDERS);
  assert.deepEqual(list("RootFiles"), PACKAGE_ROOT_FILES);
  assert.ok(PACKAGE_FOLDERS.includes("tools"));
});

test("the script stays plain ASCII so Windows PowerShell reads it correctly", async () => {
  const bytes = await readFile(SCRIPT);
  assert.ok(bytes.every((byte) => byte < 128), "non-ASCII character in tools/update.ps1");
  assert.ok((await readFile(path.resolve(import.meta.dirname, "../update.cmd"))).every((byte) => byte < 128));
});

test("a release zip updates changed files, adds new ones, removes dropped ones and keeps the user's own", windows, async () => {
  const root = await folder({ ...OLD, "notes.txt": "mine", "dev/x.js": "dev();" });
  const archive = await zipOf(NEXT);
  const { code, out } = await run(root, archive);
  assert.equal(code, 0, out);
  assert.match(out, /updated to 1\.0\.112/);
  assert.equal(await text(root, "app/prism.js"), "render(2);\n");
  assert.equal(await text(root, "app/panel/panel.js"), "panel();\n");
  assert.equal(await text(root, "ui/z.js"), "z(2);\n");
  assert.equal(await text(root, "content/crunchilist.js"), "bundle(2);\n");
  assert.equal(await text(root, "app/old.js"), null);
  assert.equal(await text(root, "lib/a.js"), crlf("export const a = 1;\n"), "unchanged files keep their Windows line endings");
  assert.equal(await text(root, "notes.txt"), "mine");
  assert.equal(await text(root, "dev/x.js"), "dev();");
  const written = JSON.parse(await text(root, "manifest.json"));
  assert.equal(written.version, "1.0.112");
  assert.equal(written.externally_connectable, undefined);
  assert.deepEqual(written.content_scripts, [{ matches: ["https://www.crunchyroll.com/*"], js: ["content/crunchilist.js"] }]);
  await cleanup(root, archive);
});

test("GitHub's source zip installs only the extension's files", windows, async () => {
  const root = await folder(OLD);
  const archive = await zipOf({ ...NEXT, "tests/a.test.js": "t();", "scripts/package.mjs": "p();", "dev/badge-options.html": "<p>", "content/main.js": "src();", "lib/a.test.js": "t();" }, "crunchilist-1.0.112/");
  const { code, out } = await run(root, archive);
  assert.equal(code, 0, out);
  assert.equal(await version(root), "1.0.112");
  for (const file of ["tests/a.test.js", "scripts/package.mjs", "dev/badge-options.html", "content/main.js", "lib/a.test.js"]) assert.ok(!existsSync(path.join(root, file)), file);
  await cleanup(root, archive);
});

test("nothing happens when the folder already has that version", windows, async () => {
  const root = await folder(OLD);
  const archive = await zipOf({ ...NEXT, "manifest.json": manifest("1.0.111") });
  const { code, out } = await run(root, archive);
  assert.equal(code, 0, out);
  assert.match(out, /already have the newest version/);
  assert.equal(await text(root, "app/prism.js"), crlf("render(1);\n"));
  await cleanup(root, archive);
});

test("a folder that isn't Crunchilist, or a git checkout, is refused", windows, async () => {
  const archive = await zipOf(NEXT);
  const other = await folder({ ...OLD, "manifest.json": JSON.stringify({ name: "Something else", version: "1.0.0" }) });
  const wrong = await run(other, archive);
  assert.equal(wrong.code, 1);
  assert.match(wrong.out, /isn't a Crunchilist folder/);
  const clone = await folder({ ...OLD, ".git/HEAD": "ref: refs/heads/master" });
  const git = await run(clone, archive);
  assert.equal(git.code, 1);
  assert.match(git.out, /git pull/);
  assert.equal(await text(clone, "app/prism.js"), crlf("render(1);\n"));
  await cleanup(other, clone, archive);
});

test("a file that can't be written puts everything back", windows, async () => {
  const root = await folder(OLD);
  const archive = await zipOf(NEXT);
  await chmod(path.join(root, "ui/z.js"), 0o444);
  const { code, out } = await run(root, archive);
  assert.equal(code, 1, out);
  assert.match(out, /Couldn't write ui\/z\.js.*Nothing was changed/s);
  assert.equal(await version(root), "1.0.111");
  assert.equal(await text(root, "app/prism.js"), crlf("render(1);\n"), "files already written are put back");
  assert.equal(await text(root, "app/panel/panel.js"), null, "new files are removed again");
  assert.equal(await text(root, "app/old.js"), crlf("retired();\n"));
  await chmod(path.join(root, "ui/z.js"), 0o666);
  await cleanup(root, archive);
});

test("a damaged download changes nothing", windows, async () => {
  const root = await folder(OLD);
  const archive = await zipOf(NEXT);
  await writeFile(archive, "not a zip");
  const { code, out } = await run(root, archive);
  assert.equal(code, 1);
  assert.match(out, /damaged/);
  assert.equal(await version(root), "1.0.111");
  await cleanup(root, archive);
});

test("from GitHub: master's exact commit when there's no release, the release tag when there is", windows, async () => {
  const noRelease = await fakeGitHub({ download: sourceZip(NEXT) });
  const root = await folder(OLD);
  const first = await run(root, null, ...noRelease.args);
  await noRelease.close();
  assert.equal(first.code, 0, first.out);
  assert.equal(await version(root), "1.0.112");
  assert.deepEqual(noRelease.hits, ["/repos/Phoniix/crunchilist/releases/latest", "/repos/Phoniix/crunchilist/commits/master", `/Phoniix/crunchilist/zip/${COMMIT}`]);

  const tagged = await fakeGitHub({ release: "v1.0.113", download: sourceZip({ ...NEXT, "manifest.json": manifest("1.0.113") }) });
  const second = await run(root, null, ...tagged.args);
  await tagged.close();
  assert.equal(second.code, 0, second.out);
  assert.equal(tagged.hits[1], "/Phoniix/crunchilist/zip/v1.0.113");
  assert.equal(await version(root), "1.0.113");
  await cleanup(root);
});

test("from GitHub: rate limits, a dropped connection and a cut-off download change nothing", windows, async () => {
  const cases = [
    [{ release: 403, download: sourceZip(NEXT) }, /limiting requests/],
    [{ download: 429 }, /limiting requests/],
    [{ release: "drop", download: sourceZip(NEXT) }, /Couldn't reach GitHub/],
    [{ download: "drop" }, /Couldn't reach GitHub|damaged/],
    [{ download: { cut: true, bytes: sourceZip(NEXT) } }, /Couldn't reach GitHub|damaged/],
    [{ download: 500 }, /GitHub answered 500/],
    [{ commit: "drop", download: sourceZip(NEXT) }, /Couldn't reach GitHub/],
    [{ commit: "not-a-sha", download: sourceZip(NEXT) }, /didn't make sense/],
  ];
  for (const [setup, message] of cases) {
    const github = await fakeGitHub(setup);
    const root = await folder(OLD);
    const { code, out } = await run(root, null, ...github.args);
    await github.close();
    assert.equal(code, 1, `${JSON.stringify(setup).slice(0, 60)}: ${out}`);
    assert.match(out, message);
    assert.equal(await version(root), "1.0.111");
    assert.equal(await text(root, "app/prism.js"), crlf("render(1);\n"));
    assert.equal(await text(root, "app/panel/panel.js"), null);
    await cleanup(root);
  }
});

test("a run cut off halfway (window closed, power loss) is finished by running it again", windows, async () => {
  const root = await folder({ ...OLD, "app/prism.js": NEXT["app/prism.js"], "app/panel/panel.js": NEXT["app/panel/panel.js"] });
  const archive = await zipOf(NEXT);
  const { code, out } = await run(root, archive);
  assert.equal(code, 0, out);
  assert.match(out, /3 changed, 1 removed/);
  assert.equal(await version(root), "1.0.112");
  assert.equal(await text(root, "ui/z.js"), "z(2);\n");
  assert.equal(await text(root, "app/old.js"), null);
  await cleanup(root, archive);
});

test("updating again and again stays correct, and a repeat run changes nothing", windows, async () => {
  const root = await folder({ ...OLD, "notes.txt": "mine" });
  let files = NEXT;
  for (const [step, next] of [["1.0.112", NEXT], ["1.0.113", { ...NEXT, "app/prism.js": "render(3);\n", "lib/b.js": "b();\n" }], ["1.0.114", { ...NEXT, "app/prism.js": "render(4);\n" }]]) {
    files = { ...next, "manifest.json": manifest(step) };
    const archive = await zipOf(files);
    const { code, out } = await run(root, archive);
    assert.equal(code, 0, out);
    assert.equal(await version(root), step);
    await cleanup(archive);
  }
  assert.equal(await text(root, "app/prism.js"), "render(4);\n");
  assert.equal(await text(root, "lib/b.js"), null, "a file added in one version and dropped in the next is gone");
  assert.equal(await text(root, "notes.txt"), "mine");
  const archive = await zipOf(files);
  const again = await run(root, archive);
  assert.match(again.out, /already have the newest version/);
  await cleanup(root, archive);
});
