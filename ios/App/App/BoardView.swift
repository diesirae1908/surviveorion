import SwiftUI

struct BoardView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            if let entries = model.board?.entries, !entries.isEmpty {
                ForEach(Array(entries.enumerated()), id: \.element.id) { idx, row in
                    HStack(spacing: 12) {
                        Text("\(idx + 1)")
                            .font(OrionFont.display(18, weight: .bold))
                            .foregroundStyle(OrionColor.hullGold)
                            .frame(width: 32, alignment: .trailing)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.callsign)
                                .font(OrionFont.body(17, weight: .bold))
                                .foregroundStyle(OrionColor.starlight)
                            Text(row.virtual == true ? "ghost" : (row.mode ?? ""))
                                .font(OrionFont.body(13))
                                .foregroundStyle(OrionColor.bronze)
                        }
                        Spacer()
                        Text(row.best.formatted())
                            .font(OrionFont.display(18, weight: .bold))
                            .foregroundStyle(OrionColor.goldPale)
                    }
                    .listRowBackground(OrionColor.deepSpace)
                    .frame(minHeight: OrionLayout.minTap)
                }
            } else {
                Text(model.online ? "No scores yet today." : "Can't reach patrol command.")
                    .font(OrionFont.body(16))
                    .foregroundStyle(OrionColor.bronze)
                    .listRowBackground(OrionColor.void)
            }
        }
        .scrollContentBackground(.hidden)
        .background(OrionColor.void.ignoresSafeArea())
        .navigationTitle("Today's Board")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.refresh() }
    }
}
