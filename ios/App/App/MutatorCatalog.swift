import Foundation

struct MutatorLine: Identifiable, Equatable {
    var name: String
    var subline: String
    var id: String { name }
}

enum MutatorCatalog {
    private static let schedule: [String: [MutatorLine]] = {
        guard let url = Bundle.main.url(forResource: "mutator-schedule", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONDecoder().decode([String: [[String: String]]].self, from: data)
        else { return [:] }
        return raw.mapValues { rows in
            rows.compactMap { row in
                guard let name = row["name"], let subline = row["subline"] else { return nil }
                return MutatorLine(name: name, subline: subline)
            }
        }
    }()

    static func today(_ dateStr: String = PatrolDate.dateString()) -> [MutatorLine] {
        schedule[dateStr] ?? []
    }
}
