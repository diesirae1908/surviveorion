import Foundation

struct MutatorLine: Identifiable, Equatable {
    var name: String
    var subline: String
    var id: String { name }
}

/// One `mutators.overlay` switch row from `/api/config` (`features.flags`).
/// `entries` maps an overlay id to its `params.entries.<id>.on`.
struct OverlaySwitchRow: Decodable {
    var id: Int
    var from: String
    var enabled: Bool
    var entries: [String: Bool]

    private enum CodingKeys: String, CodingKey { case id, from, enabled, params }
    private struct Params: Decodable { var entries: [String: Entry]? }
    private struct Entry: Decodable { var on: Bool? }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        from = try c.decode(String.self, forKey: .from)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        let p = try? c.decode(Params.self, forKey: .params)
        entries = (p?.entries ?? [:]).compactMapValues { $0.on }
    }
}

/// Only the `mutators.overlay` rows out of `/api/config`. Lenient on purpose: any
/// shape problem yields no rows (= the bundled legacy labels), never a throw, and it
/// is a separate type so `AppConfig` (sign-in) never depends on the features block.
struct OverlayConfig: Decodable {
    var rows: [OverlaySwitchRow]

    private enum CodingKeys: String, CodingKey { case features }
    private enum FeatureKeys: String, CodingKey { case flags }
    private struct FlagKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
    private struct Versions: Decodable { var versions: [OverlaySwitchRow] }

    init(from decoder: Decoder) throws {
        rows = []
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let f = try? c.nestedContainer(keyedBy: FeatureKeys.self, forKey: .features),
              let flags = try? f.nestedContainer(keyedBy: FlagKey.self, forKey: .flags),
              let key = FlagKey(stringValue: "mutators.overlay"),
              let v = try? flags.decode(Versions.self, forKey: key)
        else { return }
        rows = v.versions
    }
}

enum MutatorCatalog {
    private static let raw: [String: [[String: String]]] = {
        guard let url = Bundle.main.url(forResource: "mutator-schedule", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([String: [[String: String]]].self, from: data)
        else { return [:] }
        return decoded
    }()

    private static let schedule: [String: [MutatorLine]] = raw.mapValues { rows in
        rows.compactMap { row in
            guard let name = row["name"], let subline = row["subline"] else { return nil }
            return MutatorLine(name: name, subline: subline)
        }
    }

    /// Overlay Daily Mutator per date (flat `overlayId` / `overlayName` / `overlaySubline`
    /// on the day's first row). Exported only for days an overlay entry can take.
    private static let overlays: [String: (id: String, line: MutatorLine)] = raw.compactMapValues { (rows: [[String: String]]) -> (id: String, line: MutatorLine)? in
        guard let first = rows.first,
              let id = first["overlayId"],
              let name = first["overlayName"]
        else { return nil }
        return (id: id, line: MutatorLine(name: name, subline: first["overlaySubline"] ?? ""))
    }

    /// `mutators.overlay` rows from `/api/config`, set by `AppModel.refresh()`.
    /// Empty (never fetched, offline, switch never written) = the bundled legacy
    /// labels, exactly what 1.1 shows.
    static var overlayRows: [OverlaySwitchRow] = []

    /// Same rule as the server's `resolveFlag` + `overlayEntryOn`: the newest row
    /// whose `from` is on or before the date (ties: higher id) decides, and it must be
    /// enabled with `params.entries.<id>.on == true`. No row = off.
    static func overlayOn(_ dateStr: String, id: String) -> Bool {
        var best: OverlaySwitchRow?
        for r in overlayRows where r.from <= dateStr {
            if let b = best, r.from < b.from || (r.from == b.from && r.id <= b.id) { continue }
            best = r
        }
        guard let row = best else { return false }
        return row.enabled && row.entries[id] == true
    }

    static func today(_ dateStr: String = PatrolDate.dateString()) -> [MutatorLine] {
        if let o = overlays[dateStr], overlayOn(dateStr, id: o.id) { return [o.line] }
        return schedule[dateStr] ?? []
    }

    static func name(for dateStr: String) -> String {
        today(dateStr).first?.name ?? "CLASSIC"
    }

    static func shortName(for dateStr: String) -> String {
        name(for: dateStr)
    }
}
