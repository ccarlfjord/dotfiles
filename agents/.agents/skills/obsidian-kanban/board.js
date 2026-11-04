// Kanban board editor. Define `op` before this code; it runs in Obsidian's
// renderer via `obsidian eval`. Supported actions: list, add, move, remove,
// toggle, rename, addLane.
//   list    { path }
//   add     { path, lane, text, position?="bottom"|"top" }
//   move    { path, match, to, position? }
//   remove  { path, match }
//   toggle  { path, match, state="done"|"todo" }
//   rename  { path, match, text }
//   addLane { path, lane }
const CARD = /^(\s*)[-*] \[([ xX])\] (.*)$/;

const laneList = (lines) => {
  const lanes = [];
  lines.forEach((l, i) => {
    const m = /^## (.+?)\s*$/.exec(l);
    if (m) lanes.push({ name: m[1], head: i, start: i + 1, end: lines.length });
  });
  for (let i = 0; i < lanes.length; i++) lanes[i].end = i + 1 < lanes.length ? lanes[i + 1].head : lines.length;
  return lanes;
};
const laneNamed = (lines, name) => {
  const lane = laneList(lines).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  if (!lane) throw new Error("no such lane: " + name);
  return lane;
};
const cardIndices = (lines, lane) => {
  const out = [];
  for (let i = lane.start; i < lane.end; i++) if (CARD.test(lines[i])) out.push(i);
  return out;
};
const findCard = (lines, match) => {
  const hits = [];
  lines.forEach((l, i) => { const m = CARD.exec(l); if (m && m[3].toLowerCase().includes(String(match).toLowerCase())) hits.push({ i, m }); });
  if (!hits.length) throw new Error("no card matching: " + match);
  if (hits.length > 1) throw new Error(hits.length + " cards match: " + match);
  return hits[0];
};
const insertCard = (lines, lane, line, position) => {
  const cards = cardIndices(lines, lane);
  if (cards.length && position === "top") lines.splice(cards[0], 0, line);
  else if (cards.length) lines.splice(cards[cards.length - 1] + 1, 0, line);
  else lines.splice(lane.start, 0, "", line);
};

(async () => {
  const file = app.vault.getAbstractFileByPath(op.path);
  if (!file) throw new Error("no such board: " + op.path);

  if (op.action === "list") {
    const lines = (await app.vault.read(file)).split("\n");
    return JSON.stringify(laneList(lines).map((lane) => ({
      lane: lane.name,
      cards: cardIndices(lines, lane).map((i) => CARD.exec(lines[i])[3]),
    })), null, 2);
  }

  await app.vault.process(file, (content) => {
    const lines = content.split("\n");
    if (op.action === "add") {
      insertCard(lines, laneNamed(lines, op.lane), "- [ ] " + op.text, op.position);
    } else if (op.action === "move") {
      const hit = findCard(lines, op.match);
      const [line] = lines.splice(hit.i, 1);
      const target = laneNamed(lines, op.to);
      insertCard(lines, target, line, op.position);
    } else if (op.action === "remove") {
      lines.splice(findCard(lines, op.match).i, 1);
    } else if (op.action === "toggle") {
      const hit = findCard(lines, op.match);
      lines[hit.i] = lines[hit.i].replace(/\[[ xX]\]/, op.state === "done" ? "[x]" : "[ ]");
    } else if (op.action === "rename") {
      const hit = findCard(lines, op.match);
      lines[hit.i] = lines[hit.i].replace(/(\[[ xX]\] ).*$/, "$1" + op.text);
    } else if (op.action === "addLane") {
      lines.push("", "## " + op.lane);
    } else {
      throw new Error("unknown action: " + op.action);
    }
    for (let i = 1; i < lines.length; i++) {
      if (/^## /.test(lines[i]) && lines[i - 1] !== "" && lines[i - 1] !== "---") lines.splice(i, 0, "");
    }
    return lines.join("\n");
  });
  return op.action + " ok";
})()
