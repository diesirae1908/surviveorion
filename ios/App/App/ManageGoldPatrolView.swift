import StoreKit
import SwiftUI
import UIKit

/// Our own Gold Patrol management screen. TestFlight/sandbox render
/// `AppStore.showManageSubscriptions(in:)` as raw localization keys and its
/// cancel button does nothing, and apps cannot cancel a subscription
/// themselves, so this reads status from StoreKit 2 / the server and hands
/// off to Apple (or Stripe) only for the actual change/cancel step.
struct ManageGoldPatrolView: View {
    var onDismiss: () -> Void

    @EnvironmentObject private var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var restoreMessage: String?
    @State private var portalBusy = false
    @State private var portalError: String?

    private enum ManageState {
        case stripe
        case apple
        case granted
        case inactive
    }

    private var state: ManageState {
        if model.premiumSource == "stripe" { return .stripe }
        if model.store.entitlementActive { return .apple }
        if model.tier == .premium { return .granted }
        return .inactive
    }

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
                VStack(spacing: 16) {
                    ZStack {
                        GoldBloom(diameter: 110)
                        PatrolSightMark(size: 56, showCore: true)
                    }
                    Text("GOLD PATROL")
                        .font(OrionFont.display(28))
                        .foregroundStyle(OrionColor.goldGradient)
                    content
                    footerLinks
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
        .background(OrionColor.void.ignoresSafeArea())
        .presentationDetents([.large])
        .task { await refreshStatus() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await refreshStatus() } }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .stripe: stripeContent
        case .apple: appleContent
        case .granted: grantedContent
        case .inactive: inactiveContent
        }
    }

    private var appleContent: some View {
        VStack(spacing: 16) {
            ChamferedPanel {
                VStack(alignment: .leading, spacing: 10) {
                    Text(planPriceLine)
                        .font(OrionFont.display(20, weight: .bold))
                        .foregroundStyle(OrionColor.starlight)
                    Text(statusLine)
                        .font(OrionFont.body(15))
                        .foregroundStyle(statusColor)
                    Text("Billed to your Apple ID.")
                        .font(OrionFont.body(13, weight: .regular))
                        .foregroundStyle(OrionColor.dust)
                }
            }
            Button("Change plan or cancel") {
                openAppleSubscriptions()
            }
            .buttonStyle(OrionButtonStyle(kind: .primary))
            Text("Apple handles plan changes and cancellation. If you cancel, Gold Patrol stays active until the end of the period you paid for.")
                .font(OrionFont.body(12, weight: .regular))
                .foregroundStyle(OrionColor.dust)
                .multilineTextAlignment(.center)
            restoreButton
        }
    }

    private var stripeContent: some View {
        VStack(spacing: 16) {
            ChamferedPanel {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Gold Patrol")
                        .font(OrionFont.display(20, weight: .bold))
                        .foregroundStyle(OrionColor.starlight)
                    Text("Billed on surviveorion.com")
                        .font(OrionFont.body(15))
                        .foregroundStyle(OrionColor.starlight)
                }
            }
            Button(portalBusy ? "Opening…" : "Manage billing") {
                Task { await openStripePortal() }
            }
            .buttonStyle(OrionButtonStyle(kind: .primary, enabled: !portalBusy))
            .disabled(portalBusy)
            if let portalError {
                Text(portalError)
                    .font(OrionFont.body(13))
                    .foregroundStyle(OrionColor.alarm)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var grantedContent: some View {
        VStack(spacing: 16) {
            ChamferedPanel {
                Text("Gold Patrol is active on your account.")
                    .font(OrionFont.body(16))
                    .foregroundStyle(OrionColor.starlight)
            }
            restoreButton
        }
    }

    private var inactiveContent: some View {
        VStack(spacing: 16) {
            Text("No active Gold Patrol")
                .font(OrionFont.body(16))
                .foregroundStyle(OrionColor.starlight)
            restoreButton
        }
    }

    private var restoreButton: some View {
        VStack(spacing: 6) {
            Button("Restore purchases") {
                Task { await restore() }
            }
            .font(OrionFont.body(13, weight: .bold))
            .foregroundStyle(OrionColor.bronze)
            .frame(minHeight: OrionLayout.minTap)
            if let restoreMessage {
                Text(restoreMessage)
                    .font(OrionFont.body(13))
                    .foregroundStyle(OrionColor.dust)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var footerLinks: some View {
        ViewThatFits {
            HStack(spacing: 8) {
                Link("Terms of Use (EULA)", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
                    .foregroundStyle(OrionColor.dust)
                Text("·")
                    .foregroundStyle(OrionColor.dust)
                Link("Privacy Policy", destination: URL(string: "https://surviveorion.com/privacy.html")!)
                    .foregroundStyle(OrionColor.dust)
            }
            VStack(spacing: 4) {
                Link("Terms of Use (EULA)", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
                    .foregroundStyle(OrionColor.dust)
                Link("Privacy Policy", destination: URL(string: "https://surviveorion.com/privacy.html")!)
                    .foregroundStyle(OrionColor.dust)
            }
        }
        .font(OrionFont.body(12, weight: .regular))
        .padding(.top, 8)
    }

    private var planPriceLine: String {
        let price: String
        let period: String
        switch model.store.productId {
        case StoreKitManager.monthlyId:
            price = model.store.monthly?.displayPrice ?? ""
            period = "month"
        case StoreKitManager.yearlyId:
            price = model.store.yearly?.displayPrice ?? ""
            period = "year"
        default:
            return "Gold Patrol"
        }
        let plan = model.store.productId == StoreKitManager.yearlyId ? "Yearly" : "Monthly"
        return price.isEmpty ? plan : "\(plan) · \(price) / \(period)"
    }

    private var statusIsBillingIssue: Bool {
        guard let renewalState = model.store.renewalState else { return false }
        return renewalState == .inBillingRetryPeriod || renewalState == .inGracePeriod
    }

    private var statusLine: String {
        if statusIsBillingIssue {
            return "Payment issue. Update your payment method in the App Store."
        }
        guard let expiresAt = model.store.expiresAt else { return "" }
        let dateStr = Self.dateFormatter.string(from: expiresAt)
        switch model.store.autoRenewOn {
        case true: return "Renews on \(dateStr)"
        case false: return "Cancelled. Gold Patrol stays active until \(dateStr)."
        case nil: return "Active until \(dateStr)."
        }
    }

    private var statusColor: Color {
        if statusIsBillingIssue { return OrionColor.alarm }
        if model.store.autoRenewOn == false { return OrionColor.bronze }
        return OrionColor.starlight
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    private func openAppleSubscriptions() {
        guard let url = URL(string: "https://apps.apple.com/account/subscriptions") else { return }
        UIApplication.shared.open(url)
    }

    private func openStripePortal() async {
        portalError = nil
        portalBusy = true
        defer { portalBusy = false }
        do {
            let resp = try await APIClient.shared.billingPortal()
            guard let url = URL(string: resp.url) else {
                portalError = "Couldn't open billing. Try again."
                return
            }
            await UIApplication.shared.open(url)
        } catch {
            portalError = error.localizedDescription
        }
    }

    private func restore() async {
        restoreMessage = nil
        let ok = await model.store.restore()
        restoreMessage = model.store.lastError ?? (ok ? "Gold Patrol active." : nil)
        if ok { model.showPremiumToast() }
    }

    private func refreshStatus() async {
        await model.refresh()
    }
}
