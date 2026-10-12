import { DEMO_EPISODES } from "./demo.js";
import { mountPlayer } from "./player.js";
import { sourceKind } from "./player-core.js";

let episodes = DEMO_EPISODES.slice();
const player = mountPlayer(document.querySelector("#player"), { episodes });
let added = 0;

function addEpisode(title, src) {
  added += 1;
  const episode = { id: `added:${added}:${src.slice(0, 80)}`, label: `+${added}`, title, src };
  episodes = [...episodes, episode];
  player.setEpisodes(episodes, { play: episode.id });
}

const form = document.querySelector(".lab-source");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = form.url.value.trim();
  if (!sourceKind(url) || sourceKind(url) === "file") return form.url.setCustomValidity("Use an http(s) video link or a YouTube link"), form.url.reportValidity();
  form.url.setCustomValidity("");
  addEpisode(url.replace(/^https?:\/\//, "").slice(0, 60), url);
  form.url.value = "";
});
form.url.addEventListener("input", () => form.url.setCustomValidity(""));
form.file.addEventListener("change", () => {
  const file = form.file.files[0];
  if (file) addEpisode(file.name, URL.createObjectURL(file));
  form.file.value = "";
});
