import StoreKit
import SwiftUI

struct PremiumSheet: View {
    var context: PremiumContext
    var onDismiss: () -> Void

    @EnvironmentObject private var model: AppModel
    @Environment(\.verticalSizeClass) private var vSize
    @State private var yearly = true

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Spacer()
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(OrionColor.bronze)
                        .frame(width: OrionLayout.minTap, height: OrionLayout.minTap)
                }
                .accessibilityLabel("Close")
            }
            ScrollView {
                VStack(spacing: vSize == .compact ? 10 : 16) {
                    ZStack {
                        GoldBloom(diameter: vSize == .compact ? 90 : 140)
                        PatrolSightMark(size: vSize == .compact ? 48 : 72, showCore: true)
                    }
                    Text("GOLD PATROL")
                        .font(OrionFont.display(28))
                        .foregroundStyle(OrionColor.goldGradient)
                    Text(context.subhead)
                        .font(OrionFont.body(16))
                        .foregroundStyle(OrionColor.starlight)
                        .multilineTextAlignment(.center)
                    VStack(alignment: .leading, spacing: 10) {
                        benefit("infinity", "Unlimited Daily Patrol runs today")
                        benefit("clock.arrow.circlepath", "Replay any past Daily Patrol with full scores")
                        benefit("chart.bar.fill", "Track your history: attempts, medals, streaks, survival trends")
                        benefit("person.2.fill", "Squadrons: friends-only boards for you and your wingmates")
                    }
                    HStack(spacing: 12) {
                        planCard(
                            title: "$1.99",
                            sub: "per month",
                            selected: !yearly,
                            featured: false
                        ) { yearly = false }
                        planCard(
                            title: "$14.99",
                            sub: "per year, save 37%",
                            selected: yearly,
                            featured: true
                        ) { yearly = true }
                    }
                    .opacity(model.store.purchasing ? 0.60 : 1)
                    .allowsHitTesting(!model.store.purchasing)
                    Text(renewalDisclosure)
                        .font(OrionFont.body(12, weight: .regular))
                        .foregroundStyle(OrionColor.dust)
                        .multilineTextAlignment(.center)
                    if model.store.productsUnavailable {
                        Text("Premium unavailable")
                            .font(OrionFont.body(13))
                            .foregroundStyle(OrionColor.alarm)
                    }
                    Button(model.store.purchasing ? "Processing…" : "Start Gold Patrol") {
                        Task { await buy() }
                    }
                    .buttonStyle(OrionButtonStyle(kind: .primary, enabled: !model.store.purchasing && !model.store.productsUnavailable))
                    .disabled(model.store.purchasing || model.store.productsUnavailable)
                    Button("Already subscribed? Restore") {
                        Task { await restore() }
                    }
                    .font(OrionFont.body(13, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
                    .frame(minHeight: OrionLayout.minTap)
                    Text("Use this if you paid on another device or reinstalled.")
                        .font(OrionFont.body(12, weight: .regular))
                        .foregroundStyle(OrionColor.dust)
                        .multilineTextAlignment(.center)
                    if let err = model.store.lastError, !err.isEmpty {
                        Text(err)
                            .font(OrionFont.body(13))
                            .foregroundStyle(err.contains("No previous") ? OrionColor.bronze : OrionColor.alarm)
                            .multilineTextAlignment(.center)
                    }
                    HStack(spacing: 8) {
                        Link("Terms", destination: URL(string: "https://surviveorion.com/terms.html")!)
                            .foregroundStyle(OrionColor.dust)
                        Text("·")
                            .foregroundStyle(OrionColor.dust)
                        Link("Privacy", destination: URL(string: "https://surviveorion.com/privacy.html")!)
                            .foregroundStyle(OrionColor.dust)
                    }
                    .font(OrionFont.body(12, weight: .regular))
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
        .background(OrionColor.void.ignoresSafeArea())
        .presentationDetents([.large])
        .task { await model.store.refresh() }
    }

    private var renewalDisclosure: String {
        let monthlyPrice = model.store.monthly?.displayPrice ?? "$1.99"
        let yearlyPrice = model.store.yearly?.displayPrice ?? "$14.99"
        return "Gold Patrol renews automatically at \(monthlyPrice) per month or \(yearlyPrice) per year until cancelled. Payment goes to your Apple Account at confirmation. Cancel anytime in Settings, at least 24 hours before the period ends."
    }

    private func benefit(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(OrionColor.hullGold)
                .frame(width: 22)
            Text(text)
                .font(OrionFont.body(15))
                .foregroundStyle(OrionColor.starlight)
        }
    }

    private func planCard(title: String, sub: String, selected: Bool, featured: Bool, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            VStack(spacing: 6) {
                if featured {
                    Text("BEST VALUE")
                        .font(OrionFont.body(10, weight: .bold))
                        .foregroundStyle(OrionColor.void)
                        .tracking(1)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(OrionColor.goldGradient, in: ChamferedRectangle(chamfer: 4))
                }
                if selected {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 11, weight: .bold))
                        Text("SELECTED")
                            .font(OrionFont.body(10, weight: .bold))
                            .tracking(1)
                    }
                    .foregroundStyle(OrionColor.hullGold)
                }
                Text(title)
                    .font(OrionFont.display(22, weight: .bold))
                    .foregroundStyle(featured ? AnyShapeStyle(OrionColor.goldGradient) : AnyShapeStyle(OrionColor.starlight))
                Text(sub)
                    .font(OrionFont.body(13, weight: .regular))
                    .foregroundStyle(featured ? OrionColor.bronze : OrionColor.dust)
            }
            .frame(maxWidth: .infinity, minHeight: 92)
            .padding(12)
            .background {
                ZStack {
                    ChamferedRectangle(chamfer: 12)
                        .fill(OrionColor.deepSpace)
                    if selected {
                        ChamferedRectangle(chamfer: 12)
                            .fill(OrionColor.hullGold.opacity(0.10))
                    }
                }
            }
            .overlay {
                ChamferedRectangle(chamfer: 12)
                    .strokeBorder(
                        selected ? OrionColor.hullGold : OrionColor.hullLine,
                        lineWidth: selected ? 2.5 : 1.5
                    )
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func buy() async {
        let product = yearly ? model.store.yearly : model.store.monthly
        guard let product else {
            model.store.lastError = "Premium unavailable"
            return
        }
        if await model.store.purchase(product) {
            await model.refresh()
            model.showPremiumToast()
            onDismiss()
        }
    }

    private func restore() async {
        if await model.store.restore() {
            await model.refresh()
            model.showPremiumToast()
            onDismiss()
        }
    }
}
