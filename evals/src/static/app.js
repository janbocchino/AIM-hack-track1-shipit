const $ = (selector) => document.querySelector(selector);
const presets = [
  ["Anaesthetist", "Pre-operative anaesthesia check before quadrantectomy with intraoperative radiotherapy on 16 May 2016."],
  ["Surgeon", "Plan her operation after the tumour board in April 2016."],
  ["General practitioner", "Review her diabetes in spring 2016."],
  ["Emergency physician", "She arrives at 02:00 with dizziness and blurred vision in the left eye. Review relevant history and medication before assessment and possible contrast imaging."],
  ["General practitioner", "Check which recommended follow-ups from her June 2015 hospital stay are still open."],
];
let documents = [];
let generating = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showDocument(id, source = null) {
  const doc = documents.find((item) => item.id === id);
  if (!doc) return;
  $("#document-select").value = id;
  $("#source-meta").textContent = `${doc.id} · Index date: ${doc.index_date}. Clinical dates are in the text.`;
  const viewer = $("#source-text");
  viewer.replaceChildren();
  let selected;
  for (const passage of doc.passages) {
    const row = element("p", "passage");
    row.append(element("span", "line-number", passage.id));
    const text = element("span");
    if (source && passage.id === source.passage_id) {
      const start = passage.text.indexOf(source.quote);
      if (start >= 0) {
        text.append(document.createTextNode(passage.text.slice(0, start)), element("mark", "", source.quote), document.createTextNode(passage.text.slice(start + source.quote.length)));
        selected = row;
      } else text.textContent = passage.text;
    } else text.textContent = passage.text;
    row.append(text);
    viewer.append(row);
  }
  if (selected) {
    selected.scrollIntoView({ behavior: "smooth", block: "center" });
    viewer.focus({ preventScroll: true });
  } else viewer.scrollTop = 0;
}

function sourceButtons(sources) {
  const group = element("div", "sources");
  for (const source of sources) {
    const doc = documents.find((item) => item.id === source.document_id);
    const button = element("button", "source-link", `${doc?.title ?? source.document_id} · ${source.passage_id} ↗`);
    button.type = "button";
    button.title = source.quote;
    button.addEventListener("click", () => showDocument(source.document_id, source));
    group.append(button);
  }
  return group;
}

function section(title, count, className = "") {
  const block = element("section", `result-section ${className}`);
  const heading = element("h3", "section-title", title);
  heading.append(element("span", "count", String(count)));
  block.append(heading);
  return block;
}

function renderBriefing(data) {
  const root = $("#briefing");
  root.replaceChildren();
  const facts = section("Relevant facts", data.facts.length);
  if (!data.facts.length) facts.append(element("p", "muted", "No supported facts found for this task."));
  for (const fact of data.facts) {
    const card = element("article", "fact");
    card.append(element("h4", "", fact.label), element("p", "fact-value", fact.value), element("p", "fact-date", `${fact.date} · ${fact.status}`), sourceButtons(fact.sources));
    facts.append(card);
  }
  root.append(facts);
  const missing = section("Missing information", data.missing.length, "missing");
  for (const item of data.missing) missing.append(element("p", "missing-item", `${item} — not documented`));
  if (!data.missing.length) missing.append(element("p", "muted", "No task-specific gaps identified by the model."));
  root.append(missing);
  const conflicts = section("Conflicting information", data.contradictions.length, "conflicts");
  conflicts.append(element("p", "muted", "Across the whole record; these claims need review."));
  for (const conflict of data.contradictions) {
    const card = element("article", "conflict");
    card.append(element("h4", "", conflict.label), element("p", "", conflict.explanation));
    for (const claim of conflict.claims) {
      const evidence = element("div", "claim");
      evidence.append(element("p", "", claim.text), sourceButtons(claim.sources));
      card.append(evidence);
    }
    conflicts.append(card);
  }
  if (!data.contradictions.length) conflicts.append(element("p", "muted", "No contradictions identified by the model. This does not establish that the record is consistent."));
  root.append(conflicts);
}

document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const [role, task] = presets[Number(button.dataset.preset)];
    $("#role").value = role;
    $("#task").value = task;
    $("#task").focus();
  });
});

$("#document-select").addEventListener("change", (event) => showDocument(event.target.value));
$("#briefing-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (generating) return;
  const request = { role: $("#role").value.trim(), task: $("#task").value.trim(), as_of: $("#as-of").value };
  generating = true;
  $("#error").hidden = true;
  $("#quality-status").hidden = true;
  $("#generate").disabled = true;
  $("#generate").textContent = "Preparing and checking…";
  $("#briefing").setAttribute("aria-busy", "true");
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: controller.signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not generate the briefing.");
    renderBriefing(result.briefing);
    const quality = result.quality;
    const qualityLabels = {
      checked: "Quality check completed.",
      corrected: `Quality checker made ${quality?.changes ?? 0} changes.`,
      needs_review: "Quality checker found unresolved issues. This briefing needs review.",
      unavailable: "Quality check unavailable. This draft needs review.",
    };
    $("#quality-status").textContent = quality ? `${qualityLabels[quality.status] ?? "Review status unknown."} ${quality.seconds}s${result.cached ? " · saved review" : ""}` : "Quality check was not run. This draft needs review.";
    $("#quality-status").hidden = false;
    $("#briefing-context").textContent = `${request.role} · ${request.task} · Record cutoff: ${result.as_of}`;
    $("#timing").textContent = `${((performance.now() - started) / 1000).toFixed(1)}s${result.cached ? " · cached" : ""}`;
  } catch (error) {
    $("#error").textContent = error.name === "AbortError" ? "The request timed out. Please try again." : error.message;
    $("#error").hidden = false;
  } finally {
    clearTimeout(timeout);
    generating = false;
    $("#generate").disabled = false;
    $("#generate").textContent = "Generate briefing ↗";
    $("#briefing").setAttribute("aria-busy", "false");
  }
});

async function initialize() {
  try {
    const response = await fetch("/api/context");
    if (!response.ok) throw new Error("Could not load the patient record.");
    const context = await response.json();
    documents = context.documents;
    $("#document-count").textContent = `${documents.length} documents`;
    const picker = $("#document-select");
    picker.replaceChildren();
    for (const doc of documents) {
      const option = element("option", "", `${doc.title} · ${doc.id}`);
      option.value = doc.id;
      picker.append(option);
    }
    if (documents.length) showDocument(documents[0].id);
    if (!context.configured) {
      $("#setup").textContent = "One key needed: OPENAI_API_KEY. Copy src/.env.example to src/.env, add your key, then restart. You can browse sources now.";
      $("#setup").hidden = false;
    }
  } catch (error) {
    $("#error").textContent = error.message;
    $("#error").hidden = false;
  }
}
initialize();
