import SwiftUI

struct FeedbackView: View {
    var asSheet = false
    var onDone: (() -> Void)? = nil

    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var message = ""
    @State private var email = ""
    @State private var error: String?
    @State private var sent = false
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if !asSheet {
                    OrionScreenBar(title: "PILOT DEBRIEF") { goBack() }
                } else {
                    Text("PILOT DEBRIEF")
                        .font(OrionFont.display(24))
                        .foregroundStyle(OrionColor.starlight)
                        .frame(maxWidth: .infinity)
                }
                if sent {
                    VStack(spacing: 14) {
                        Text("TRANSMISSION RECEIVED")
                            .font(OrionFont.display(24))
                            .foregroundStyle(OrionColor.goldGradient)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                        Text("Thank you, pilot. Your report is in the log.")
                            .font(OrionFont.body(16))
                            .foregroundStyle(OrionColor.starlight)
                            .multilineTextAlignment(.center)
                        if !email.trimmingCharacters(in: .whitespaces).isEmpty {
                            Text("We'll reach out if it earns a reward.")
                                .font(OrionFont.body(15))
                                .foregroundStyle(OrionColor.bronze)
                                .multilineTextAlignment(.center)
                        }
                        Button(asSheet ? "Done" : "Back") { goBack() }
                            .buttonStyle(OrionButtonStyle(kind: .primary))
                    }
                    .padding(.top, 24)
                } else {
                    Text("Bugs, ideas, patrol gripes. Every report helps.")
                        .font(OrionFont.body(15))
                        .foregroundStyle(OrionColor.starlight)
                        .frame(maxWidth: .infinity)
                        .multilineTextAlignment(.center)
                    TextEditor(text: $message)
                        .font(OrionFont.body(16))
                        .foregroundStyle(OrionColor.starlight)
                        .scrollContentBackground(.hidden)
                        .padding(10)
                        .frame(minHeight: 120)
                        .background(OrionColor.void, in: ChamferedRectangle(chamfer: 8))
                        .overlay {
                            ChamferedRectangle(chamfer: 8)
                                .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                        }
                        .overlay(alignment: .topLeading) {
                            if message.isEmpty {
                                Text("What's on your mind, pilot?")
                                    .font(OrionFont.body(16))
                                    .foregroundStyle(OrionColor.dust)
                                    .padding(14)
                                    .allowsHitTesting(false)
                            }
                        }
                        .onChange(of: message) { _, v in
                            if v.count > 2000 { message = String(v.prefix(2000)) }
                        }
                    TextField("", text: $email, prompt: Text("Email (optional)").foregroundStyle(OrionColor.dust))
                        .font(OrionFont.body(16))
                        .foregroundStyle(OrionColor.starlight)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.horizontal, 12)
                        .frame(minHeight: OrionLayout.minTap)
                        .background(OrionColor.void, in: ChamferedRectangle(chamfer: 8))
                        .overlay {
                            ChamferedRectangle(chamfer: 8)
                                .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                        }
                    Text("Leave an email if you'd like a reply, or a reward for a great report.")
                        .font(OrionFont.body(13, weight: .regular))
                        .foregroundStyle(OrionColor.dust)
                    if let error {
                        Text(error)
                            .font(OrionFont.body(14))
                            .foregroundStyle(OrionColor.alarm)
                    }
                    Button(busy ? "Transmitting…" : "Transmit") {
                        Task { await send() }
                    }
                    .buttonStyle(OrionButtonStyle(kind: .primary, enabled: !busy))
                    .disabled(busy)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(OrionColor.void.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar(.hidden, for: .navigationBar)
    }

    private func goBack() {
        if let onDone { onDone() } else { dismiss() }
    }

    private func send() async {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.count < 3 {
            error = "Tell us a little more first."
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await APIClient.shared.sendFeedback(
                message: text,
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                context: "native-ios"
            )
            sent = true
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
