"use strict";

const processDiagram = document.getElementById("metallurgy-route-map");
const routeData = JSON.parse(document.getElementById("metallurgy-route-data").textContent);
const chapterButtons = [...document.querySelectorAll(".process-chapters [data-chapter]")];
const orePicker = document.getElementById("metallurgy-ore");
const gradePicker = document.getElementById("metallurgy-grade");
const oreModeButtons = [...document.querySelectorAll("[data-ore-mode]")];
const oreModes = document.querySelector(".process-ore-modes");
const routeStatus = document.getElementById("metallurgy-route-status");
const quickRoutes = document.getElementById("metallurgy-quick-routes");
const alternate = document.getElementById("metallurgy-alternate");
const alternateTitle = document.getElementById("metallurgy-alternate-title");
const alternateContent = document.getElementById("metallurgy-alternate-content");
const recipePanel = document.getElementById("ore-recipes");
const recipeTitle = document.getElementById("ore-recipe-title");
const recipeGrade = document.getElementById("ore-recipe-grade");
const recipeUse = document.getElementById("ore-recipe-use");
const recipeRows = document.getElementById("ore-recipe-rows");
const processEdges = [...processDiagram.querySelectorAll(".dependency-edge")];
const processNodes = new Map(
  [...processDiagram.querySelectorAll(".diagram-node")].map((node) => {
    const tooltip = document.getElementById(node.getAttribute("aria-describedby"));
    const image = node.querySelector("img");
    return [node.dataset.node, {
      node,
      image,
      caption: node.querySelector(".node-caption"),
      title: tooltip.querySelector(".preview-title"),
      previous: tooltip.querySelector("[data-previous-step]"),
      next: tooltip.querySelector("[data-next-step]"),
      original: { item: image.dataset.gameItem, label: node.getAttribute("aria-label") },
    }];
  }),
);
let selectedChapter = "1";
let oreMode = "all";

function stepText(place, steps, names) {
  const text = [...steps].map((key) => names.get(key)).join("、");
  place.textContent = text;
  place.parentElement.hidden = !text;
}

function routeStep(key, tag, size) {
  const source = processNodes.get(key);
  const step = document.createElement(tag);
  step.className = "metallurgy-step";
  const image = document.createElement("img");
  image.src = source.image.getAttribute("src");
  image.width = image.height = size;
  image.alt = "";
  const label = document.createElement("span");
  label.textContent = source.caption.textContent;
  step.append(image, label);
  return step;
}

function routeLane(path, label) {
  const lane = document.createElement("div");
  lane.className = "metallurgy-lane";
  lane.tabIndex = 0;
  lane.setAttribute("role", "region");
  lane.setAttribute("aria-label", label);
  const steps = document.createElement("ol");
  steps.className = "metallurgy-steps";
  steps.append(...path.map((key) => routeStep(key, "li", 48)));
  lane.append(steps);
  return lane;
}

function showQuickRoutes(paths, supportedEdges) {
  quickRoutes.replaceChildren(routeLane(paths[0], "加工步骤"));
  const otherPaths = paths.slice(1);
  // Only complete recorded paths get a route lane. A supported edge is one connection.
  const pathEdges = new Set(paths.flatMap((path) => path.slice(1).map((to, index) => `${path[index]}:${to}`)));
  const connections = supportedEdges.filter(([from, to]) => !pathEdges.has(`${from}:${to}`));
  alternate.hidden = !otherPaths.length && !connections.length;
  alternate.open = false;
  alternateContent.replaceChildren();
  if (alternate.hidden) return;

  if (otherPaths.length && connections.length) {
    alternateTitle.textContent = "其他完整路线与单步衔接";
  } else if (otherPaths.length) {
    alternateTitle.textContent = `展开其他 ${otherPaths.length} 条完整路线`;
  } else {
    alternateTitle.textContent = `展开 ${connections.length} 个受支持的单步衔接`;
  }
  alternateContent.append(...otherPaths.map((path, index) => routeLane(path, `备选流程 ${index + 1}`)));
  if (!connections.length) return;
  if (otherPaths.length) {
    const heading = document.createElement("p");
    heading.className = "metallurgy-control-label";
    heading.textContent = "受支持的单步衔接";
    alternateContent.append(heading);
  }
  const list = document.createElement("ul");
  list.className = "metallurgy-connections";
  for (const [from, to] of connections) {
    const item = document.createElement("li");
    const arrow = document.createElement("span");
    arrow.textContent = "→";
    item.append(routeStep(from, "span", 24), arrow, routeStep(to, "span", 24));
    list.append(item);
  }
  alternateContent.append(list);
}

function showProcessRoute(route, label) {
  const currentNodes = new Set();
  const currentEdges = new Set();
  const previous = new Map();
  const next = new Map();
  const names = new Map();

  for (const path of route.paths) {
    for (const key of path) currentNodes.add(key);
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1];
      const to = path[index];
      const outgoing = next.get(from) ?? new Set();
      const incoming = previous.get(to) ?? new Set();
      outgoing.add(to);
      incoming.add(from);
      next.set(from, outgoing);
      previous.set(to, incoming);
      currentEdges.add(`${from}:${to}`);
    }
  }

  for (const [key, node] of processNodes) {
    const { item, label: name } = route.skin[key] ?? node.original;
    names.set(key, name);
    node.node.classList.toggle("route-active", currentNodes.has(key));
    node.node.setAttribute("aria-label", name);
    node.caption.textContent = name;
    node.title.textContent = name;
    if (node.image.dataset.gameItem !== item) {
      node.image.src = "icons/" + item.replace(":", "--") + ".png";
      node.image.dataset.gameItem = item;
    }
  }

  for (const [key, node] of processNodes) {
    stepText(node.previous, previous.get(key) ?? [], names);
    stepText(node.next, next.get(key) ?? [], names);
  }

  for (const edge of processEdges) {
    edge.classList.toggle("route-active", currentEdges.has(`${edge.dataset.from}:${edge.dataset.to}`));
  }
  processDiagram.classList.add("route-filtered");
  const heading = document.createElement("strong");
  heading.textContent = label;
  routeStatus.replaceChildren(heading, document.createTextNode("　" + route.note));
}

function selectChapter(id) {
  const chapter = routeData.chapters[id];
  if (!chapter) return;
  selectedChapter = id;
  orePicker.value = "";
  oreModes.hidden = true;
  recipePanel.hidden = true;
  for (const button of chapterButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.chapter === id));
  }
  showProcessRoute(chapter, chapter.name + " · 本章路线");
  showQuickRoutes(chapter.paths, []);
}

function showOreRecipes(ore, paths) {
  const floor = routeData.chapters[String(ore.chapter)].name;
  recipeTitle.textContent = ore.name + "的配方";
  recipeGrade.textContent = "最低处理等级　" + ore.chapter + " 档 · " + floor +
    (ore.location ? "　｜　" + ore.location : "");
  recipeUse.hidden = !ore.usage;
  recipeUse.textContent = ore.usage ?? "";

  const nodes = new Set(paths.flat());
  const arrows = new Set(paths.flatMap((path) => path.slice(1).map((step, i) => path[i] + ":" + step)));
  const lines = document.createDocumentFragment();
  const headings = ["机器或步骤", "需要什么", "产出"];
  for (const recipe of ore.recipes) {
    if (!nodes.has(recipe.node)) continue;
    const relevant = recipe.node === "wheel"
      ? recipe.via.some((end) => arrows.has(recipe.node + ":" + end))
      : recipe.via.some((from) => arrows.has(from + ":" + recipe.node));
    if (recipe.via.length && !relevant) continue;
    const row = document.createElement("tr");
    const columns = [recipe.machine + (recipe.planned ? "（规划）" : ""), recipe.input, recipe.output];
    for (const [index, text] of columns.entries()) {
      const cell = document.createElement("td");
      cell.dataset.label = headings[index];
      cell.textContent = text;
      row.append(cell);
    }
    lines.append(row);
  }
  recipeRows.replaceChildren(lines);
  recipePanel.hidden = false;
}

function selectOre(id) {
  const ore = routeData.ores[id];
  if (!ore) {
    selectChapter(selectedChapter);
    return;
  }
  oreModes.hidden = false;
  for (const button of chapterButtons) button.setAttribute("aria-pressed", "false");
  const chapter = routeData.chapters[String(ore.chapter)];
  if (oreMode === "all") {
    showProcessRoute({
      paths: ore.supportedEdges,
      skin: { ...ore.skin, ...ore.supportedSkin },
      note: ore.supportedNote,
    }, ore.name + " · 全部支持 · " + chapter.name + "起");
    showQuickRoutes(ore.paths, ore.supportedEdges);
    showOreRecipes(ore, ore.supportedEdges);
  } else {
    showProcessRoute(ore, ore.name + " · 最低门槛 · " + chapter.name);
    showQuickRoutes(ore.paths, []);
    showOreRecipes(ore, ore.paths);
  }
}

for (const button of chapterButtons) {
  button.addEventListener("click", () => selectChapter(button.dataset.chapter));
}
orePicker.addEventListener("change", () => selectOre(orePicker.value));
function filterOreOptions() {
  for (const option of orePicker.querySelectorAll("option[data-grade]")) {
    option.hidden = Boolean(gradePicker.value && option.dataset.grade !== gradePicker.value);
    option.disabled = option.hidden;
  }
}
gradePicker.addEventListener("change", () => {
  filterOreOptions();
  const selected = routeData.ores[orePicker.value];
  if (selected && gradePicker.value && String(selected.chapter) !== gradePicker.value) {
    selectChapter(selectedChapter);
  }
});
for (const button of oreModeButtons) {
  button.addEventListener("click", () => {
    oreMode = button.dataset.oreMode;
    for (const option of oreModeButtons) {
      option.setAttribute("aria-pressed", String(option === button));
    }
    if (orePicker.value) selectOre(orePicker.value);
  });
}

function getLinkedChapter() {
  return window.location.hash.match(/^#(?:chapter|stage)-([1-7])$/)?.[1];
}
function openLinkedOre() {
  const key = window.location.hash.match(/^#ore-([a-z0-9_]+)$/)?.[1];
  if (!key || !routeData.ores[key]) return false;
  gradePicker.value = "";
  filterOreOptions();
  orePicker.value = key;
  selectOre(key);
  return true;
}
function revealLinkedDetails() {
  const target = document.getElementById(window.location.hash.slice(1));
  if (!target) return;
  let ancestor = target;
  let expanded = false;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
      ancestor.open = true;
      expanded = true;
    }
    ancestor = ancestor.parentElement;
  }
  if (expanded) requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
}

window.addEventListener("hashchange", () => {
  if (!openLinkedOre()) {
    const id = getLinkedChapter();
    if (id) selectChapter(id);
  }
  revealLinkedDetails();
});
if (!openLinkedOre()) selectChapter(getLinkedChapter() ?? selectedChapter);
revealLinkedDetails();
