// Orders panel on the lobby (owner: WS-O2). `ordersPanelModel` is pure and
// tested in node (scripts/test-orders-ui.ts); `ordersPanel` only maps the
// model to elements. Styles: src/styles/orders.css (imported by main.ts).
//
// Shown only while the `orders` switch is on for today (the view is non-null).
// Signed-out pilots see the same three orders read-only plus "Sign in to earn
// Merit": progress is server side, so nothing is tracked locally.

import { ORDERS_UI_COPY, fill } from "../ladder";
import type { OrdersView } from "../orders";

export interface OrdersPanelRow {
  /** Order difficulty 1 (easy) to 3 (hard). Not the ladder tier. */
  difficulty: 1 | 2 | 3;
  line: string;
  done: boolean;
  merit: string;
  aria: string;
}

export interface OrdersPanelModel {
  title: string;
  /** "2 OF 3 DONE" while signed in; null for a signed-out pilot. */
  progress: string | null;
  rows: OrdersPanelRow[];
  footer: string;
  /** Signed out only. */
  signIn: string | null;
}

/** Pure view model. Null when there is nothing to show. */
export function ordersPanelModel(view: OrdersView | null): OrdersPanelModel | null {
  if (!view || view.orders.length === 0) return null;
  const rows = view.orders.map<OrdersPanelRow>((o) => {
    const done = !view.signedOut && o.done;
    const merit = fill(ORDERS_UI_COPY.meritTag, { n: o.merit });
    return {
      difficulty: o.tier,
      line: o.line,
      done,
      merit,
      aria: `${o.line}, ${merit}${done ? ", done" : ""}`,
    };
  });
  const doneCount = rows.filter((r) => r.done).length;
  return {
    title: ORDERS_UI_COPY.panelTitle,
    progress: view.signedOut ? null : fill(ORDERS_UI_COPY.progress, { done: doneCount, total: rows.length }),
    rows,
    footer: ORDERS_UI_COPY.panelFooter,
    signIn: view.signedOut ? ORDERS_UI_COPY.signedOut : null,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The "TODAY'S ORDERS" plate, or null when the orders switch is off. */
export function ordersPanel(view: OrdersView | null): HTMLElement | null {
  const m = ordersPanelModel(view);
  if (!m) return null;
  const card = el("div", "ord-panel chamfer");
  card.id = "orders-panel";
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", m.title);
  const head = el("div", "ord-head");
  head.append(el("span", "ord-title", m.title));
  if (m.progress) head.append(el("span", "ord-progress", m.progress));
  card.append(head);
  const list = el("ul", "ord-list");
  for (const r of m.rows) {
    const li = el("li", `ord-row${r.done ? " done" : ""}`);
    li.setAttribute("aria-label", r.aria);
    const pips = el("span", "ord-pips");
    pips.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 3; i++) pips.append(el("i", `ord-pip${i <= r.difficulty ? " on" : ""}`));
    const check = el("span", "ord-check", r.done ? "✓" : "");
    check.setAttribute("aria-hidden", "true");
    const line = el("span", "ord-line", r.line);
    const merit = el("span", "ord-merit", r.merit);
    li.append(pips, line, merit, check);
    list.append(li);
  }
  card.append(list);
  if (m.signIn) card.append(el("div", "ord-signin", m.signIn));
  card.append(el("div", "ord-foot", m.footer));
  return card;
}
