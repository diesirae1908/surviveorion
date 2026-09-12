import SwiftUI

struct SquadronsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var tab = 0
    @State private var friends: [FriendRow] = []
    @State private var incoming: [FriendRow] = []
    @State private var outgoing: [FriendRow] = []
    @State private var board: [FriendRow] = []
    @State private var activity: [FriendActivity] = []
    @State private var callsign = ""
    @State private var note: String?
    @State private var noteAlarm = false
    @State private var confirmRemove: FriendRow?
    @FocusState private var addFocused: Bool

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                OrionScreenBar(title: "SQUADRONS") { dismiss() }
                if model.pendingFriends > 0 {
                    Circle()
                        .fill(OrionColor.alarm)
                        .frame(width: 8, height: 8)
                        .offset(x: 72, y: -10)
                }
            }
            segment
            if tab == 0 {
                boardSegment
            } else {
                matesSegment
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(OrionColor.void.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .confirmationDialog(
            "Remove this wingmate?",
            isPresented: Binding(
                get: { confirmRemove != nil },
                set: { if !$0 { confirmRemove = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                if let row = confirmRemove {
                    Task { await remove(row.callsign) }
                }
            }
            Button("Cancel", role: .cancel) { confirmRemove = nil }
        }
    }

    private var segment: some View {
        HStack(spacing: 8) {
            seg("SQUADRON BOARD", 0)
            seg("WINGMATES", 1)
        }
    }

    private func seg(_ title: String, _ i: Int) -> some View {
        Button {
            tab = i
        } label: {
            Text(title)
                .font(OrionFont.body(12, weight: .bold))
                .foregroundStyle(tab == i ? OrionColor.hullGold : OrionColor.bronze)
                .tracking(1)
                .frame(maxWidth: .infinity, minHeight: 36)
                .background(tab == i ? OrionColor.deepSpace : Color.clear, in: ChamferedRectangle(chamfer: 8))
                .overlay {
                    ChamferedRectangle(chamfer: 8)
                        .strokeBorder(tab == i ? OrionColor.hullGold : Color.clear, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
    }

    private var boardSegment: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("TODAY: \(MutatorCatalog.name(for: PatrolDate.dateString()))")
                    .font(OrionFont.body(12, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
                    .tracking(2)
                if friends.isEmpty && board.filter({ $0.callsign != model.callsign }).isEmpty {
                    OrionEmptyState(
                        title: "No wingmates yet.",
                        bodyText: "Add one from the Wingmates tab to start a squadron board.",
                        cta: "Add a Wingmate"
                    ) { tab = 1; addFocused = true }
                } else {
                    ChamferedPanel(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(board.enumerated()), id: \.element.id) { i, row in
                                if i > 0 { OrionHairline() }
                                boardRow(rank: i + 1, row: row)
                            }
                        }
                    }
                }
            }
        }
    }

    private func boardRow(rank: Int, row: FriendRow) -> some View {
        let mine = row.callsign == model.callsign
        let played = (row.best ?? 0) > 0
        return HStack {
            Text("\(rank)")
                .font(OrionFont.body(14, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .frame(width: 22)
            Text(flagLabel(row))
                .font(OrionFont.body(15, weight: .bold))
                .foregroundStyle(OrionColor.starlight)
            Spacer()
            if played {
                if let t = row.bestTime {
                    Text(OrionFormat.survived(t))
                        .font(OrionFont.body(13))
                        .foregroundStyle(OrionColor.bronze)
                }
                Text((row.best ?? 0).formatted())
                    .font(OrionFont.display(16, weight: .bold))
                    .foregroundStyle(OrionColor.starlight)
            } else {
                Text("-")
                    .font(OrionFont.body(16))
                    .foregroundStyle(OrionColor.dust)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: OrionLayout.minTap)
        .opacity(played ? 1 : 0.50)
        .overlay {
            if mine {
                ChamferedRectangle(chamfer: 8)
                    .strokeBorder(OrionColor.hullGold, lineWidth: 1)
                    .padding(2)
            }
        }
    }

    private var matesSegment: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                OrionField(title: "Callsign", text: $callsign)
                    .focused($addFocused)
                    .onSubmit { Task { await add() } }
                Button("Add") { Task { await add() } }
                    .buttonStyle(OrionButtonStyle(kind: .primary, enabled: callsign.count >= 3))
                    .disabled(callsign.count < 3)
                    .frame(width: 88)
            }
            if let note {
                Text(note)
                    .font(OrionFont.body(13))
                    .foregroundStyle(noteAlarm ? OrionColor.alarm : OrionColor.bronze)
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !incoming.isEmpty {
                        section("INCOMING", incoming) { row in
                            HStack(spacing: 4) {
                                iconBtn("checkmark", OrionColor.hullGold) { Task { await accept(row.callsign) } }
                                iconBtn("xmark", OrionColor.bronze) { Task { await remove(row.callsign) } }
                            }
                        }
                    }
                    if !outgoing.isEmpty {
                        section("PENDING", outgoing) { row in
                            Button("Cancel") { Task { await remove(row.callsign) } }
                                .font(OrionFont.body(13, weight: .bold))
                                .foregroundStyle(OrionColor.bronze)
                        }
                    }
                    if !friends.isEmpty {
                        section("WINGMATES (\(friends.count))", friends) { row in
                            Button("Remove") { confirmRemove = row }
                                .font(OrionFont.body(13, weight: .bold))
                                .foregroundStyle(OrionColor.dust)
                        }
                    }
                    if !activity.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(activity.prefix(8)) { a in
                                Text("\(a.callsign) flew today, scored \((a.score ?? 0).formatted())")
                                    .font(OrionFont.body(13, weight: .regular))
                                    .foregroundStyle(OrionColor.dust)
                            }
                        }
                    }
                }
            }
        }
    }

    private func section<T: View>(_ title: String, _ rows: [FriendRow], @ViewBuilder trailing: @escaping (FriendRow) -> T) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(OrionFont.body(12, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
                .tracking(2)
            ChamferedPanel(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                        if i > 0 { OrionHairline() }
                        HStack {
                            Text(flagLabel(row))
                                .font(OrionFont.body(16))
                                .foregroundStyle(OrionColor.starlight)
                            Spacer()
                            trailing(row)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: OrionLayout.minTap)
                    }
                }
            }
        }
    }

    private func iconBtn(_ name: String, _ color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(color)
                .frame(width: OrionLayout.minTap, height: OrionLayout.minTap)
        }
        .buttonStyle(.plain)
    }

    private func flagLabel(_ row: FriendRow) -> String {
        let flag = OrionFormat.flag(country: row.country)
        return flag.isEmpty ? row.callsign : "\(flag) \(row.callsign)"
    }

    private func load() async {
        do {
            let f = try await APIClient.shared.friends()
            friends = f.friends
            incoming = f.incoming
            outgoing = f.outgoing
            model.pendingFriends = incoming.count
            if let b = try? await APIClient.shared.friendsBoard(date: PatrolDate.dateString()) {
                board = b.entries
            }
            if let a = try? await APIClient.shared.friendActivity() {
                activity = a.activity
            }
        } catch {
            note = error.localizedDescription
            noteAlarm = true
        }
    }

    private func add() async {
        let name = callsign.trimmingCharacters(in: .whitespaces)
        guard name.count >= 3 else { return }
        do {
            try await APIClient.shared.requestFriend(callsign: name)
            callsign = ""
            note = "Request sent."
            noteAlarm = false
            await load()
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                if note == "Request sent." { note = nil }
            }
        } catch {
            note = error.localizedDescription
            noteAlarm = true
        }
    }

    private func accept(_ name: String) async {
        do {
            try await APIClient.shared.acceptFriend(callsign: name)
            await load()
        } catch {
            note = error.localizedDescription
            noteAlarm = true
        }
    }

    private func remove(_ name: String) async {
        do {
            try await APIClient.shared.removeFriend(callsign: name)
            confirmRemove = nil
            await load()
        } catch {
            note = error.localizedDescription
            noteAlarm = true
        }
    }
}
