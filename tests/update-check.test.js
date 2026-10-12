import assert from "node:assert/strict";
import test from "node:test";
import { CHECK_EVERY_MS, MASTER_ZIP, RELEASES_URL, cleanVersion, compareVersions, dueForCheck, fromManifest, fromRelease, reloadForDisk, updateStatus } from "../lib/update-check.js";

test("a newer version put on disk by update.cmd restarts Crunchilist once", () => {
  assert.equal(reloadForDisk("1.0.111", "1.0.112", undefined), true);
  assert.equal(reloadForDisk("1.0.111", "1.0.112", "1.0.112"), false, "already tried this version");
  assert.equal(reloadForDisk("1.0.112", "1.0.112", undefined), false);
  assert.equal(reloadForDisk("1.0.112", "1.0.111", undefined), false);
  assert.equal(reloadForDisk("1.0.111", "", undefined), false, "unreadable manifest");
});

test("versions compare part by part, with or without a v tag", () => {
  assert.equal(compareVersions("1.0.108", "1.0.107"), 1);
  assert.equal(compareVersions("v1.0.107", "1.0.107"), 0);
  assert.equal(compareVersions("1.0.99", "1.0.100"), -1);
  assert.equal(compareVersions("1.1", "1.0.200"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(cleanVersion("release-5"), "");
  assert.equal(cleanVersion(" v2.3.4 "), "2.3.4");
});

test("a release gives its version, page and zip download", () => {
  const release = fromRelease({
    tag_name: "v1.0.110",
    html_url: "https://github.com/Phoniix/crunchilist/releases/tag/v1.0.110",
    body: "Fixes",
    assets: [
      { name: "notes.txt", browser_download_url: "https://github.com/x/notes.txt" },
      { name: "crunchilist-1.0.110.zip", browser_download_url: "https://github.com/Phoniix/crunchilist/releases/download/v1.0.110/crunchilist-1.0.110.zip" },
    ],
  });
  assert.equal(release.version, "1.0.110");
  assert.equal(release.download, "https://github.com/Phoniix/crunchilist/releases/download/v1.0.110/crunchilist-1.0.110.zip");
  assert.equal(release.notes, "Fixes");
  assert.equal(release.source, "release");
});

test("links that leave GitHub, drafts, prereleases and odd tags are ignored", () => {
  const sneaky = fromRelease({ tag_name: "1.0.110", html_url: "https://evil.example/r", assets: [{ name: "x.zip", browser_download_url: "https://evil.example/x.zip" }] });
  assert.equal(sneaky.page, RELEASES_URL);
  assert.equal(sneaky.download, "");
  assert.equal(fromRelease({ tag_name: "v2.0.0", draft: true }), null);
  assert.equal(fromRelease({ tag_name: "v2.0.0", prerelease: true }), null);
  assert.equal(fromRelease({ tag_name: "latest" }), null);
  assert.equal(fromRelease(null), null);
});

test("without releases the manifest on master is the newest version", () => {
  assert.deepEqual(fromManifest({ version: "1.0.108" }), { version: "1.0.108", page: "https://github.com/Phoniix/crunchilist", download: MASTER_ZIP, notes: "", source: "master", ref: "master" });
  assert.equal(fromManifest({}), null);
});

test("GitHub is asked at most twice a day unless the user asks", () => {
  const now = 10 * CHECK_EVERY_MS;
  assert.equal(dueForCheck(0, now), true);
  assert.equal(dueForCheck(now - 1000, now), false);
  assert.equal(dueForCheck(now - CHECK_EVERY_MS, now), true);
  assert.equal(dueForCheck(now - 1000, now, true), true);
  assert.equal(dueForCheck(now + 60000, now), true);
});

test("an update shows only when newer, and is announced once per version", () => {
  const latest = { version: "1.0.110", page: RELEASES_URL, download: "" };
  assert.deepEqual(updateStatus({ checkedAt: 5, latest }, "1.0.107"), { current: "1.0.107", checkedAt: 5, error: "", available: true, latest, announce: true });
  assert.equal(updateStatus({ checkedAt: 5, latest, announced: "1.0.110" }, "1.0.107").announce, false);
  assert.equal(updateStatus({ checkedAt: 5, latest }, "1.0.110").available, false);
  assert.equal(updateStatus({ checkedAt: 5, latest: { version: "1.0.100" } }, "1.0.107").latest, null);
  assert.equal(updateStatus(null, "1.0.107").available, false);
});
