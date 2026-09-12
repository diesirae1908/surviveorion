import SwiftUI

enum AccountTier: String, Codable {
    case free
    case premium
    case admin
}

struct TierBadge: View {
    var tier: AccountTier

    var body: some View {
        Text(label)
            .font(OrionFont.body(11, weight: .bold))
            .foregroundStyle(textStyle)
            .tracking(2)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 6))
            .overlay {
                ChamferedRectangle(chamfer: 6)
                    .strokeBorder(stroke, lineWidth: 1)
            }
    }

    private var label: String {
        switch tier {
        case .free: return "FREE"
        case .premium: return "PREMIUM"
        case .admin: return "CREW"
        }
    }

    private var stroke: Color {
        switch tier {
        case .free: return OrionColor.bronze
        case .premium: return OrionColor.hullGold
        case .admin: return OrionColor.alarm.opacity(0.60)
        }
    }

    private var textStyle: AnyShapeStyle {
        switch tier {
        case .free: AnyShapeStyle(OrionColor.bronze)
        case .premium: AnyShapeStyle(OrionColor.goldGradient)
        case .admin: AnyShapeStyle(OrionColor.alarm)
        }
    }
}

struct PremiumLockGlyph: View {
    var body: some View {
        ZStack {
            ChamferedRectangle(chamfer: 4)
                .fill(OrionColor.void)
            ChamferedRectangle(chamfer: 4)
                .strokeBorder(OrionColor.bronze, lineWidth: 1)
            Image(systemName: "lock.fill")
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(OrionColor.bronze)
        }
        .frame(width: 20, height: 20)
        .accessibilityLabel("Patrol Archive locked")
    }
}

struct ActivatePremiumChip: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Image(systemName: "crown.fill")
                    .font(.system(size: 10, weight: .bold))
                Text("ACTIVATE")
                    .font(OrionFont.body(11, weight: .bold))
                    .tracking(1)
            }
            .foregroundStyle(OrionColor.hullGold)
            .padding(.horizontal, 10)
            .frame(minHeight: OrionLayout.minTap)
            .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 8))
            .overlay {
                ChamferedRectangle(chamfer: 8)
                    .strokeBorder(OrionColor.hullGold.opacity(0.55), lineWidth: 1)
            }
        }
        .accessibilityLabel("Activate Premium")
    }
}

struct OrionEmptyState: View {
    var title: String
    var bodyText: String
    var cta: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            PatrolSightMark(size: 56, showCore: false)
                .opacity(0.20)
            Text(title)
                .font(OrionFont.display(22))
                .foregroundStyle(OrionColor.starlight)
                .multilineTextAlignment(.center)
            Text(bodyText)
                .font(OrionFont.body(15, weight: .regular))
                .foregroundStyle(OrionColor.dust)
                .multilineTextAlignment(.center)
            if let cta, let action {
                Button(cta, action: action)
                    .buttonStyle(OrionButtonStyle(kind: .secondary))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }
}

struct MiniBarRow: View {
    var values: [Double]
    var missed: [Bool]

    var body: some View {
        GeometryReader { geo in
            let n = max(values.count, 1)
            let gap: CGFloat = 3
            let w = max(4, (geo.size.width - gap * CGFloat(n - 1)) / CGFloat(n))
            let peak = max(values.max() ?? 1, 0.001)
            HStack(alignment: .bottom, spacing: gap) {
                ForEach(Array(values.enumerated()), id: \.offset) { i, v in
                    let h = max(3, geo.size.height * CGFloat(v / peak))
                    let isPeak = v == values.max() && v > 0 && !(missed.indices.contains(i) && missed[i])
                    let isMiss = missed.indices.contains(i) && missed[i]
                    ChamferedRectangle(chamfer: 2)
                        .fill(isMiss ? AnyShapeStyle(OrionColor.dust.opacity(0.35)) : isPeak ? AnyShapeStyle(OrionColor.goldGradient) : AnyShapeStyle(OrionColor.bronze))
                        .frame(width: w, height: h)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
        .frame(height: 72)
    }
}

struct OrionListRow<Trailing: View>: View {
    var icon: String? = nil
    var iconColor: Color = OrionColor.hullGold
    var label: String
    var value: String? = nil
    var chevron = false
    @ViewBuilder var trailing: Trailing

    init(
        icon: String? = nil,
        iconColor: Color = OrionColor.hullGold,
        label: String,
        value: String? = nil,
        chevron: Bool = false,
        @ViewBuilder trailing: () -> Trailing
    ) {
        self.icon = icon
        self.iconColor = iconColor
        self.label = label
        self.value = value
        self.chevron = chevron
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 10) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(iconColor)
                    .frame(width: 22)
            }
            Text(label)
                .font(OrionFont.body(16))
                .foregroundStyle(OrionColor.starlight)
                .lineLimit(2)
            Spacer(minLength: 8)
            if let value {
                Text(value)
                    .font(OrionFont.body(15, weight: .bold))
                    .foregroundStyle(OrionColor.bronze)
            }
            trailing
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(OrionColor.bronze)
            }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: OrionLayout.minTap)
    }
}

extension OrionListRow where Trailing == EmptyView {
    init(icon: String? = nil, iconColor: Color = OrionColor.hullGold, label: String, value: String? = nil, chevron: Bool = false) {
        self.init(icon: icon, iconColor: iconColor, label: label, value: value, chevron: chevron) { EmptyView() }
    }
}

struct OrionBackChip: View {
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(OrionColor.hullGold)
                .frame(width: OrionLayout.minTap, height: OrionLayout.minTap)
                .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: 8))
                .overlay {
                    ChamferedRectangle(chamfer: 8)
                        .strokeBorder(OrionColor.hullLine, lineWidth: 1)
                }
        }
        .accessibilityLabel("Back")
    }
}

struct OrionScreenBar: View {
    var title: String
    var dismiss: () -> Void

    var body: some View {
        ZStack {
            Text(title)
                .font(OrionFont.display(24))
                .foregroundStyle(OrionColor.starlight)
            HStack {
                OrionBackChip(action: dismiss)
                Spacer()
            }
        }
        .frame(minHeight: OrionLayout.minTap)
    }
}

struct OrionHairline: View {
    var body: some View {
        Rectangle()
            .fill(OrionColor.hullLine.opacity(0.40))
            .frame(height: 1)
            .padding(.horizontal, 12)
    }
}
