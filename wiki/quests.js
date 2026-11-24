
const triggerSelector = ".quest-link[aria-describedby], .milestone[aria-describedby], .diagram-node[aria-describedby]";
let active;
let closeTimer;

function nodePosition(node, diagramBounds) {
  const bounds = node.getBoundingClientRect();
  return {
    x: bounds.left - diagramBounds.left + bounds.width / 2,
    y: bounds.top - diagramBounds.top + bounds.height / 2,
    radius: bounds.width / 2,
    square: node.classList.contains("node-machine"),
  };
}

function distanceFromNode(node, point) {
  const dx = Math.abs(point.x - node.x);
  const dy = Math.abs(point.y - node.y);
  return node.square ? Math.max(dx, dy) : Math.hypot(dx, dy);
}

function nodeBoundary(node, point) {
  const distance = distanceFromNode(node, point);
  if (distance === 0) return node;
  const ratio = Math.min(1, node.radius / distance);
  return {
    x: node.x + (point.x - node.x) * ratio,
    y: node.y + (point.y - node.y) * ratio,
  };
}

function mountDiagram(diagram) {
  const svg = diagram.querySelector(".dependency-lines");
  const [, , designWidth, designHeight] = svg.getAttribute("viewBox").trim().split(/\s+/).map(Number);
  const nodes = [...diagram.querySelectorAll(".diagram-node")];
  const edges = [...svg.querySelectorAll(".dependency-edge")].map((path) => {
    const values = path.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
    const bends = [];
    for (let index = 2; index < values.length - 2; index += 2) {
      bends.push({ x: values[index] / designWidth, y: values[index + 1] / designHeight });
    }
    return { path, bends };
  });

  function layout() {
    const rect = diagram.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const positions = new Map(nodes.map((node) => [node.dataset.node, nodePosition(node, rect)]));
    svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
    for (const { path, bends } of edges) {
      const source = positions.get(path.dataset.from);
      const target = positions.get(path.dataset.to);
      if (!source || !target) continue;
      const turns = bends.map(({ x, y }) => ({ x: x * rect.width, y: y * rect.height }));
      while (turns.length && distanceFromNode(source, turns[0]) <= source.radius) turns.shift();
      while (turns.length && distanceFromNode(target, turns.at(-1)) <= target.radius) turns.pop();
      const points = [
        nodeBoundary(source, turns[0] ?? target),
        ...turns,
        nodeBoundary(target, turns.at(-1) ?? source),
      ];
      path.setAttribute("d", "M " + points.map(({ x, y }) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L "));
    }
    positionPreview();
  }

  layout();
  if (typeof ResizeObserver === "function") new ResizeObserver(layout).observe(diagram);
  else window.addEventListener("resize", layout);
}

for (const diagram of document.querySelectorAll("[data-diagram]")) mountDiagram(diagram);

function positionPreview() {
  if (!active) return;
  const { trigger, preview } = active;
  const anchor = trigger.getBoundingClientRect();
  const width = preview.offsetWidth;
  const height = preview.offsetHeight;
  const margin = 12;
  const gap = 6;
  const right = document.documentElement.clientWidth - width - margin;
  const bottom = document.documentElement.clientHeight - height - margin;
  const center = anchor.left + (anchor.width - width) / 2;
  const below = anchor.bottom + gap;
  const above = anchor.top - gap - height;
  preview.style.left = Math.max(margin, Math.min(center, right)) + "px";
  preview.style.top = Math.max(margin, Math.min(below <= bottom ? below : above, bottom)) + "px";
}

function hidePreview() {
  clearTimeout(closeTimer);
  if (!active) return;
  active.preview.hidden = true;
  if (active.diagram) {
    active.diagram.classList.remove("is-tracing");
    for (const element of active.diagram.querySelectorAll(".is-linked")) element.classList.remove("is-linked");
  }
  active = undefined;
}

function showPreview(trigger, preview) {
  hidePreview();
  const diagram = trigger.closest("[data-diagram]");
  active = { trigger, preview, diagram };
  if (diagram) {
    const node = trigger.dataset.node;
    const linkedNodes = new Set([node]);
    const selectedRoute = diagram.classList.contains("route-filtered") && trigger.classList.contains("route-active");
    for (const edge of diagram.querySelectorAll(".dependency-edge")) {
      const { from, to } = edge.dataset;
      if (selectedRoute && !edge.classList.contains("route-active")) continue;
      if (from === node || to === node) {
        edge.classList.add("is-linked");
        linkedNodes.add(from).add(to);
      }
    }
    for (const button of diagram.querySelectorAll(".diagram-node")) {
      if (linkedNodes.has(button.dataset.node)) button.classList.add("is-linked");
    }
    diagram.classList.add("is-tracing");
  }
  preview.hidden = false;
  positionPreview();
}

function leavePreview(trigger, preview) {
  if (active?.trigger !== trigger) return;
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (active?.trigger !== trigger) return;
    if (document.activeElement === trigger || trigger.matches(":hover") || preview.matches(":hover")) return;
    hidePreview();
  }, 150);
}

for (const trigger of document.querySelectorAll(triggerSelector)) {
  const preview = document.getElementById(trigger.getAttribute("aria-describedby"));
  if (!preview) continue;
  trigger.addEventListener("focus", () => showPreview(trigger, preview));
  trigger.addEventListener("blur", () => leavePreview(trigger, preview));
  trigger.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") showPreview(trigger, preview);
  });
  trigger.addEventListener("pointerleave", () => leavePreview(trigger, preview));
  preview.addEventListener("pointerenter", () => clearTimeout(closeTimer));
  preview.addEventListener("pointerleave", () => leavePreview(trigger, preview));
  if (trigger.tagName === "BUTTON") {
    trigger.addEventListener("click", () => showPreview(trigger, preview));
  }
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hidePreview();
});
document.addEventListener("pointerdown", (event) => {
  if (active && !active.trigger.contains(event.target) && !active.preview.contains(event.target)) hidePreview();
});
window.addEventListener("resize", positionPreview);
document.addEventListener("scroll", positionPreview, { capture: true, passive: true });
