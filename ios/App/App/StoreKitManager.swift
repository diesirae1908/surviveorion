import Foundation
import StoreKit
import UIKit

@MainActor
final class StoreKitManager: ObservableObject {
    static let monthlyId = "com.surviveorion.app.premium.monthly"
    static let yearlyId = "com.surviveorion.app.premium.yearly"

    @Published var monthly: Product?
    @Published var yearly: Product?
    @Published var productsUnavailable = false
    @Published var purchasing = false
    @Published var lastError: String?
    @Published var entitled = false
    @Published var productId: String?
    @Published var expiresAt: Date?

    /// Verified, unrevoked, unexpired StoreKit entitlement on this Apple ID.
    /// Re-checks the clock so an app left open past expiry drops premium.
    var entitlementActive: Bool {
        guard entitled, let expiresAt else { return false }
        return expiresAt > Date()
    }

    private var updates: Task<Void, Never>?

    init() {
        updates = Task { await listenForUpdates() }
        Task { await refresh() }
    }

    deinit {
        updates?.cancel()
    }

    func refresh() async {
        do {
            let products = try await Product.products(for: [Self.monthlyId, Self.yearlyId])
            monthly = products.first(where: { $0.id == Self.monthlyId })
            yearly = products.first(where: { $0.id == Self.yearlyId })
            productsUnavailable = monthly == nil && yearly == nil
        } catch {
            productsUnavailable = true
            lastError = "Premium unavailable"
        }
        await updateEntitlement()
    }

    func purchase(_ product: Product) async -> Bool {
        purchasing = true
        lastError = nil
        defer { purchasing = false }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let (transaction, jws) = try checkVerifiedTransaction(verification)
                await apply(transaction)
                _ = try? await APIClient.shared.reportPremium(signedTransaction: jws)
                await transaction.finish()
                return true
            case .userCancelled:
                return false
            case .pending:
                lastError = "Purchase is pending approval."
                return false
            @unknown default:
                lastError = "Purchase could not finish."
                return false
            }
        } catch {
            let detail = (error as NSError).localizedDescription
            let clipped = String(detail.prefix(120))
            lastError = clipped.isEmpty
                ? "Purchase failed. Try Restore Purchases."
                : "Purchase failed. Try Restore Purchases. (\(clipped))"
            return false
        }
    }

    func restore() async -> Bool {
        purchasing = true
        lastError = nil
        defer { purchasing = false }
        if productsUnavailable {
            await refresh()
        }
        do {
            try await AppStore.sync()
            await updateEntitlement()
            if !entitlementActive {
                lastError = "No previous purchase found for this Apple ID."
            }
            return entitlementActive
        } catch {
            lastError = productsUnavailable
                ? "The App Store catalog isn't loaded yet. Check your connection and try again."
                : "Couldn't restore this purchase. Check your Apple ID and try again."
            return false
        }
    }

    /// Apple's native manage sheet. Unlike the apps.apple.com page it also
    /// lists TestFlight and sandbox subscriptions. False if it could not open.
    func showManageSubscriptions() async -> Bool {
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive })
        else { return false }
        do {
            try await AppStore.showManageSubscriptions(in: scene)
        } catch {
            return false
        }
        await updateEntitlement()
        return true
    }

    private func listenForUpdates() async {
        for await update in Transaction.updates {
            guard let (transaction, jws) = try? checkVerifiedTransaction(update) else { continue }
            await apply(transaction)
            _ = try? await APIClient.shared.reportPremium(signedTransaction: jws)
            await transaction.finish()
        }
    }

    private func updateEntitlement() async {
        var found = false
        var pid: String?
        var until: Date?
        var jws: String?
        for await entitlement in Transaction.currentEntitlements {
            guard let (transaction, signed) = try? checkVerifiedTransaction(entitlement) else { continue }
            guard Self.isPremium(transaction), let exp = transaction.expirationDate else { continue }
            if let current = until, current >= exp { continue }
            found = true
            pid = transaction.productID
            until = exp
            jws = signed
        }
        entitled = found
        productId = pid
        expiresAt = until
        // StoreKit is the source of truth. The UserDefaults copy is only a
        // launch hint, so it is cleared as soon as StoreKit reports nothing
        // (refund, revocation, expiry, or another Apple ID on the device).
        if found, let until {
            PreferencesStore.localPremiumUntil = until.timeIntervalSince1970
            PreferencesStore.localPremiumProduct = pid
            if let jws {
                _ = try? await APIClient.shared.reportPremium(signedTransaction: jws)
            }
        } else {
            PreferencesStore.localPremiumUntil = 0
            PreferencesStore.localPremiumProduct = nil
        }
    }

    private static func isPremium(_ transaction: Transaction) -> Bool {
        guard transaction.productID == monthlyId || transaction.productID == yearlyId else { return false }
        guard transaction.revocationDate == nil, let exp = transaction.expirationDate else { return false }
        return exp > Date()
    }

    private func apply(_ transaction: Transaction) async {
        if Self.isPremium(transaction), let exp = transaction.expirationDate {
            entitled = true
            productId = transaction.productID
            expiresAt = exp
            PreferencesStore.localPremiumUntil = exp.timeIntervalSince1970
            PreferencesStore.localPremiumProduct = transaction.productID
        }
        await updateEntitlement()
    }

    private func checkVerifiedTransaction(_ result: VerificationResult<Transaction>) throws -> (Transaction, String) {
        switch result {
        case .unverified:
            throw APIError.server("Unverified App Store transaction")
        case .verified(let safe):
            return (safe, result.jwsRepresentation)
        }
    }
}
