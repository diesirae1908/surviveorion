/**
 * Gold Patrol / premium gates: GET /api/me tier shape + past/future daily submit
 * + CREW boot-promote. In-memory SQLite. No HTTP server.
 * Run: node scripts/test-premium-gates.mjs
 */
process.env.ORION_DB = ":memory:";
process.env.CLIP_INBOX_CALLSIGN = "CrewPilot";

const { createUser, setUserPremium, setUserRole, ensureCrewCallsigns, getUserByCallsign } =
  await import("../server/db.mjs");
const { userTier, resolveDailySubmit, clampMutatorRange, addCivilDays } = await import(
  "../server/tier.mjs"
);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (!ok) failures++;
}

const today = "2026-09-12";
const past = "2026-09-10";
const future = "2026-09-20";

const free = createUser({ callsign: "FreePilot" });
const prem = createUser({ callsign: "PremPilot" });
setUserPremium(prem.id, {
  until: Date.now() + 86400_000,
  productId: "com.surviveorion.app.premium.monthly",
  transactionId: "tx-test",
});
const crew = createUser({ callsign: "CrewPilot" });
const roleAdmin = createUser({ callsign: "RoleAdmin" });
setUserRole(roleAdmin.id, "admin");

const freeT = userTier(free);
check("unsigned / missing user is free", userTier(null).tier === "free");
check("new account is free", freeT.tier === "free" && freeT.premiumActive === false);
check("GET /api/me tier fields exist on free", freeT.clipInbox === false);

const premFresh = (await import("../server/db.mjs")).getUserById(prem.id);
const premT = userTier(premFresh);
check("StoreKit until makes premium", premT.tier === "premium" && premT.premiumActive === true);

const crewT = userTier(crew);
check("clip-inbox allowlist is admin", crewT.tier === "admin" && crewT.premiumActive === true && crewT.clipInbox === true);

const roleT = userTier((await import("../server/db.mjs")).getUserById(roleAdmin.id));
check("users.role=admin is admin without clip env match", roleT.tier === "admin" && roleT.premiumActive === true);

const todayFree = resolveDailySubmit({ daily: true }, free, today);
check("today daily allowed for free", todayFree.dailyDate === today && !todayFree.error);

const todayImplicit = resolveDailySubmit({ daily: true, dailyDate: today }, free, today);
check("today with explicit date allowed for free", todayImplicit.dailyDate === today && !todayImplicit.error);

const pastFree = resolveDailySubmit({ daily: true, dailyDate: past }, free, today);
check(
  "past-day submit blocked for free",
  pastFree.error?.status === 403 &&
    pastFree.error?.code === "PREMIUM_REQUIRED" &&
    pastFree.error?.error === "Gold Patrol required to file a past-day score.",
  JSON.stringify(pastFree.error),
);

const pastPrem = resolveDailySubmit({ daily: true, dailyDate: past }, premFresh, today);
check("past-day submit allowed for premium", pastPrem.dailyDate === past && !pastPrem.error);

const pastCrew = resolveDailySubmit({ daily: true, dailyDate: past }, crew, today);
check("past-day submit allowed for admin", pastCrew.dailyDate === past && !pastCrew.error);

const futureFree = resolveDailySubmit({ daily: true, dailyDate: future }, free, today);
check("future submit blocked for free", futureFree.error?.code === "CREW_REQUIRED");

const futurePrem = resolveDailySubmit({ daily: true, dailyDate: future }, premFresh, today);
check("future submit blocked for premium", futurePrem.error?.code === "CREW_REQUIRED");

const futureCrew = resolveDailySubmit({ daily: true, dailyDate: future }, crew, today);
check("future submit allowed for admin", futureCrew.dailyDate === future && !futureCrew.error);

const notDaily = resolveDailySubmit({ daily: false, dailyDate: past }, free, today);
check("non-daily run ignores dailyDate", notDaily.dailyDate === null && !notDaily.error);

const rangeFree = clampMutatorRange({ from: "2026-09-01", to: "2026-09-30", today, admin: false });
check("mutator range clamps free to today", rangeFree.to === today && !rangeFree.empty);

const rangeAdmin = clampMutatorRange({ from: today, to: "2026-12-01", today, admin: true, horizon: 14 });
check("mutator range admin horizon is +14", rangeAdmin.to === addCivilDays(today, 14));

const luciux = createUser({ callsign: "LUCIUX" });
check("luciux starts free", (luciux.role ?? "free") === "free");
const keepPrem = createUser({ callsign: "KeepPrem" });
setUserRole(keepPrem.id, "premium");
const logs = [];
ensureCrewCallsigns({ CREW_CALLSIGNS: "luciux" }, { log: (m) => logs.push(m) });
check("luciux boot-promoted to admin", getUserByCallsign("luciux").role === "admin");
check("promote logs once", logs.length === 1 && String(logs[0]).includes("luciux"));
ensureCrewCallsigns({ CREW_CALLSIGNS: "luciux" }, { log: (m) => logs.push(m) });
check("promote is idempotent", logs.length === 1 && getUserByCallsign("luciux").role === "admin");
check("other premium role not wiped", getUserByCallsign("KeepPrem").role === "premium");
const missingLogs = [];
ensureCrewCallsigns({ CREW_CALLSIGNS: "nobody-here" }, { log: (m) => missingLogs.push(m) });
check("missing callsign is a no-op", missingLogs.length === 0);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("PASS  premium / admin daily gates + me.tier + crew promote");
