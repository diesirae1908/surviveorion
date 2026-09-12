import Foundation
import StoreKit

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
                let transaction = try checkVerified(verification)
                await apply(transaction)
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
            lastError = "Purchase failed. Try Restore Purchases."
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
            if !entitled {
                lastError = "No previous purchase found for this Apple ID."
            }
            return entitled
        } catch {
            lastError = productsUnavailable
                ? "The App Store catalog isn't loaded yet. Check your connection and try again."
                : "Couldn't restore this purchase. Check your Apple ID and try again."
            return false
        }
    }

    private func listenForUpdates() async {
        for await update in Transaction.updates {
            if let transaction = try? checkVerified(update) {
                await apply(transaction)
                await transaction.finish()
            }
        }
    }

    private func updateEntitlement() async {
        var found = false
        var pid: String?
        var until: TimeInterval = 0
        var jws: String?
        for await entitlement in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(entitlement) else { continue }
            if transaction.productID == Self.monthlyId || transaction.productID == Self.yearlyId {
                if let exp = transaction.expirationDate, exp > Date() {
                    found = true
                    pid = transaction.productID
                    until = exp.timeIntervalSince1970
                    jws = String(data: transaction.jsonRepresentation, encoding: .utf8)
                }
            }
        }
        entitled = found
        productId = pid
        if found {
            PreferencesStore.localPremiumUntil = until
            PreferencesStore.localPremiumProduct = pid
            if let jws {
                _ = try? await APIClient.shared.reportPremium(signedTransaction: jws)
            }
        } else if !PreferencesStore.localPremiumActive {
            PreferencesStore.localPremiumUntil = 0
            PreferencesStore.localPremiumProduct = nil
        }
    }

    private func apply(_ transaction: Transaction) async {
        guard transaction.productID == Self.monthlyId || transaction.productID == Self.yearlyId else { return }
        if let exp = transaction.expirationDate, exp > Date() {
            entitled = true
            productId = transaction.productID
            PreferencesStore.localPremiumUntil = exp.timeIntervalSince1970
            PreferencesStore.localPremiumProduct = transaction.productID
        }
        await updateEntitlement()
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw APIError.server("Unverified App Store transaction")
        case .verified(let safe):
            return safe
        }
    }
}
