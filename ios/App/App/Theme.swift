import SwiftUI

enum OrionColor {
    static let void = Color(red: 10 / 255, green: 10 / 255, blue: 18 / 255)
    static let deepSpace = Color(red: 18 / 255, green: 18 / 255, blue: 30 / 255)
    static let hullLine = Color(red: 42 / 255, green: 42 / 255, blue: 58 / 255)
    static let hullGold = Color(red: 1, green: 215 / 255, blue: 0)
    static let flare = Color(red: 1, green: 238 / 255, blue: 136 / 255)
    static let goldPale = flare
    static let ingot = Color(red: 204 / 255, green: 136 / 255, blue: 0)
    static let brass = Color(red: 204 / 255, green: 170 / 255, blue: 102 / 255)
    static let bronze = Color(red: 170 / 255, green: 136 / 255, blue: 68 / 255)
    static let dust = Color(red: 138 / 255, green: 122 / 255, blue: 85 / 255)
    static let risingRed = Color(red: 196 / 255, green: 30 / 255, blue: 58 / 255)
    static let alarm = Color(red: 1, green: 68 / 255, blue: 85 / 255)
    static let starlight = Color(red: 1, green: 247 / 255, blue: 224 / 255)
    static let medalSilver = Color(red: 215 / 255, green: 215 / 255, blue: 215 / 255)
    static let medalCopper = Color(red: 205 / 255, green: 127 / 255, blue: 50 / 255)

    static let goldGradient = LinearGradient(
        stops: [
            .init(color: flare, location: 0),
            .init(color: hullGold, location: 0.55),
            .init(color: ingot, location: 1)
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    static let silverGradient = LinearGradient(
        stops: [
            .init(color: Color.white, location: 0),
            .init(color: medalSilver, location: 0.55),
            .init(color: Color(white: 0.55), location: 1)
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    static let copperGradient = LinearGradient(
        stops: [
            .init(color: Color(red: 232 / 255, green: 166 / 255, blue: 104 / 255), location: 0),
            .init(color: medalCopper, location: 0.55),
            .init(color: Color(red: 138 / 255, green: 74 / 255, blue: 26 / 255), location: 1)
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    static func medalGradient(named raw: String) -> LinearGradient {
        switch raw.lowercased() {
        case "gold": return goldGradient
        case "silver": return silverGradient
        case "copper", "bronze": return copperGradient
        default: return goldGradient
        }
    }
}

enum OrionFont {
    static func display(_ size: CGFloat, weight: Font.Weight = .bold) -> Font {
        .custom(weight == .regular ? "Rajdhani-Regular" : "Rajdhani-Bold", size: size)
    }

    static func body(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .custom(weight == .regular || weight == .medium ? "Rajdhani-Regular" : "Rajdhani-Bold", size: size)
    }
}

enum OrionLayout {
    static let minTap: CGFloat = 44
}

enum OrionFormat {
    static func survived(_ t: Double) -> String {
        let m = Int(t) / 60
        let s = Int(t) % 60
        return String(format: "%d:%02d", m, s)
    }

    static func platform(_ row: DailyBoardEntry) -> String {
        if row.virtual == true { return "Ghost" }
        switch row.mode {
        case "desktop": return "Desktop"
        case "touch": return "Touch"
        case "tilt": return "Tilt"
        default: return row.mode?.capitalized ?? ""
        }
    }
}

enum OrionMotion {
    static let screen = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.35)
    static let instant = Animation.easeInOut(duration: 0.12)
    static let gameOver = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 1.6)
    static let pulse = Animation.easeInOut(duration: 2.4)
}

struct ChamferedRectangle: InsettableShape {
    var chamfer: CGFloat = 12
    var insetAmount: CGFloat = 0

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: insetAmount, dy: insetAmount)
        let cap = min(chamfer, min(r.width, r.height) * 0.22, min(r.width, r.height) / 2)
        var p = Path()
        p.move(to: CGPoint(x: r.minX + cap, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX - cap, y: r.minY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.minY + cap))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - cap))
        p.addLine(to: CGPoint(x: r.maxX - cap, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX + cap, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY - cap))
        p.addLine(to: CGPoint(x: r.minX, y: r.minY + cap))
        p.closeSubpath()
        return p
    }

    func inset(by amount: CGFloat) -> ChamferedRectangle {
        var copy = self
        copy.insetAmount += amount
        return copy
    }
}

struct ChamferedPanel<Content: View>: View {
    var goldBorder = false
    var chamfer: CGFloat = 12
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(OrionColor.deepSpace, in: ChamferedRectangle(chamfer: chamfer))
            .overlay {
                ChamferedRectangle(chamfer: chamfer)
                    .strokeBorder(
                        goldBorder ? OrionColor.hullGold.opacity(0.25) : OrionColor.hullLine,
                        lineWidth: 1.5
                    )
            }
            .clipShape(ChamferedRectangle(chamfer: chamfer))
    }
}

/// Four-arc Patrol Sight ring. Arc math ported from brand/assets/logo/orion-mark.svg (viewBox 0-100, r=37).
struct PatrolSightRing: Shape {
    func path(in rect: CGRect) -> Path {
        let side = min(rect.width, rect.height)
        let scale = side / 100
        let origin = CGPoint(x: rect.midX - 50 * scale, y: rect.midY - 50 * scale)
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: origin.x + x * scale, y: origin.y + y * scale)
        }
        let center = pt(50, 50)
        let radius = 37 * scale
        let ends: [(CGPoint, CGPoint)] = [
            (pt(26.71, 21.25), pt(73.29, 21.25)),
            (pt(78.75, 26.71), pt(78.75, 73.29)),
            (pt(73.29, 78.75), pt(26.71, 78.75)),
            (pt(21.25, 73.29), pt(21.25, 26.71))
        ]
        var path = Path()
        for (start, end) in ends {
            let startAngle = Angle(radians: atan2(start.y - center.y, start.x - center.x))
            let endAngle = Angle(radians: atan2(end.y - center.y, end.x - center.x))
            var seg = Path()
            seg.addArc(center: center, radius: radius, startAngle: startAngle, endAngle: endAngle, clockwise: true)
            path.addPath(seg)
        }
        return path
    }
}

struct PatrolSightMark: View {
    var size: CGFloat
    var showCore = true

    var body: some View {
        ZStack {
            PatrolSightRing()
                .stroke(OrionColor.goldGradient, lineWidth: size * 0.10)
            if showCore {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [OrionColor.alarm, OrionColor.risingRed],
                            center: UnitPoint(x: 0.38, y: 0.34),
                            startRadius: 0,
                            endRadius: size * 0.15
                        )
                    )
                    .frame(width: size * 0.30, height: size * 0.30)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct GoldBloom: View {
    var diameter: CGFloat = 160

    var body: some View {
        Circle()
            .fill(OrionColor.hullGold.opacity(0.18))
            .frame(width: diameter, height: diameter)
            .blur(radius: 40)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

struct StarfieldBackground: View {
    /// Brand-approved point cloud from orion-app-icon.svg, 52 of 90 stars, positions normalized.
    private static let stars: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
        (0.2388, 0.9135, 2.09, 0.64),
        (0.0493, 0.8558, 1.44, 0.21),
        (0.0688, 0.9840, 3.03, 0.45),
        (0.4519, 0.5479, 2.07, 0.57),
        (0.7798, 0.4181, 1.73, 0.61),
        (0.3625, 0.4815, 0.74, 0.55),
        (0.8342, 0.3581, 0.97, 0.67),
        (0.1221, 0.4548, 1.69, 0.23),
        (0.1141, 0.6216, 2.51, 0.22),
        (0.6056, 0.9264, 1.19, 0.48),
        (0.3527, 0.3128, 1.83, 0.54),
        (0.3098, 0.1582, 2.77, 0.49),
        (0.3793, 0.9964, 1.76, 0.27),
        (0.2537, 0.9207, 2.03, 0.43),
        (0.1749, 0.4340, 0.96, 0.18),
        (0.6916, 0.7601, 0.88, 0.45),
        (0.7419, 0.8828, 1.47, 0.38),
        (0.6384, 0.8286, 1.81, 0.42),
        (0.7857, 0.9572, 1.34, 0.62),
        (0.2071, 0.2772, 2.97, 0.54),
        (0.2088, 0.0521, 1.26, 0.59),
        (0.7600, 0.2106, 1.82, 0.56),
        (0.4173, 0.3299, 1.42, 0.28),
        (0.8708, 0.2045, 2.27, 0.53),
        (0.4403, 0.2686, 1.86, 0.35),
        (0.1005, 0.3859, 1.71, 0.56),
        (0.8614, 0.7738, 1.10, 0.52),
        (0.5851, 0.0762, 2.43, 0.59),
        (0.5628, 0.8521, 0.65, 0.55),
        (0.4356, 0.9951, 2.87, 0.28),
        (0.2818, 0.8478, 2.61, 0.67),
        (0.9522, 0.0294, 2.80, 0.30),
        (0.9806, 0.2409, 2.90, 0.60),
        (0.6479, 0.5623, 1.47, 0.27),
        (0.0270, 0.0098, 0.85, 0.56),
        (0.0876, 0.3664, 1.78, 0.68),
        (0.1891, 0.5537, 1.82, 0.38),
        (0.5382, 0.0583, 2.26, 0.30),
        (0.4420, 0.1800, 2.44, 0.55),
        (0.4315, 0.1168, 2.87, 0.22),
        (0.5868, 0.1524, 2.70, 0.37),
        (0.6395, 0.4624, 1.20, 0.35),
        (0.6820, 0.3029, 0.54, 0.57),
        (0.5621, 0.6003, 2.48, 0.45),
        (0.2883, 0.2049, 2.98, 0.58),
        (0.0281, 0.3253, 1.85, 0.21),
        (0.5242, 0.9099, 1.61, 0.64),
        (0.0076, 0.9893, 1.14, 0.40),
        (0.9363, 0.2466, 0.85, 0.65),
        (0.1374, 0.3313, 0.59, 0.45),
        (0.1801, 0.6817, 2.90, 0.40),
        (0.0590, 0.8708, 1.68, 0.19)
    ]

    var body: some View {
        Canvas { ctx, size in
            for star in Self.stars {
                let r = star.2
                let rect = CGRect(
                    x: star.0 * size.width - r,
                    y: star.1 * size.height - r,
                    width: r * 2,
                    height: r * 2
                )
                ctx.fill(Path(ellipseIn: rect), with: .color(OrionColor.starlight.opacity(star.3)))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct OrionButtonStyle: ButtonStyle {
    enum Kind {
        case primary
        case secondary
        case destructive
    }

    var kind: Kind = .primary
    var enabled = true

    func makeBody(configuration: Configuration) -> some View {
        StyleBody(kind: kind, enabled: enabled, configuration: configuration)
    }

    private struct StyleBody: View {
        var kind: Kind
        var enabled: Bool
        var configuration: ButtonStyleConfiguration

        var body: some View {
            configuration.label
                .font(OrionFont.display(18, weight: .bold))
                .foregroundStyle(textColor)
                .frame(maxWidth: .infinity, minHeight: OrionLayout.minTap)
                .background { fill }
                .overlay {
                    ChamferedRectangle(chamfer: 12)
                        .strokeBorder(strokeColor, lineWidth: 1)
                }
                .opacity(configuration.isPressed ? 0.82 : 1)
        }

        private var textColor: Color {
            if !enabled { return OrionColor.bronze }
            switch kind {
            case .primary: return OrionColor.void
            case .secondary: return OrionColor.hullGold
            case .destructive: return OrionColor.alarm
            }
        }

        private var strokeColor: Color {
            if !enabled { return OrionColor.hullGold.opacity(0.25) }
            switch kind {
            case .primary: return OrionColor.hullGold.opacity(0.80)
            case .secondary: return OrionColor.hullGold
            case .destructive: return OrionColor.alarm.opacity(0.40)
            }
        }

        @ViewBuilder
        private var fill: some View {
            if !enabled {
                ChamferedRectangle(chamfer: 12).fill(OrionColor.deepSpace)
            } else if kind == .primary {
                ChamferedRectangle(chamfer: 12).fill(OrionColor.goldGradient)
            } else {
                ChamferedRectangle(chamfer: 12).fill(OrionColor.deepSpace)
            }
        }
    }
}

struct OrionToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button {
            withAnimation(OrionMotion.instant) {
                configuration.isOn.toggle()
            }
        } label: {
            HStack {
                configuration.label
                    .font(OrionFont.body(16))
                    .foregroundStyle(OrionColor.starlight)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 12)
                OrionSwitch(isOn: configuration.isOn)
            }
            .frame(minHeight: OrionLayout.minTap)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct OrionSwitch: View {
    var isOn: Bool

    var body: some View {
        ZStack(alignment: isOn ? .trailing : .leading) {
            ChamferedRectangle(chamfer: 3)
                .fill(isOn ? AnyShapeStyle(OrionColor.goldGradient) : AnyShapeStyle(OrionColor.deepSpace))
            ChamferedRectangle(chamfer: 3)
                .strokeBorder(isOn ? Color.clear : OrionColor.hullLine, lineWidth: 1)
            ChamferedRectangle(chamfer: 2)
                .fill(isOn ? OrionColor.starlight : OrionColor.bronze)
                .frame(width: 14, height: 14)
                .padding(1)
        }
        .frame(width: 28, height: 16)
        .animation(OrionMotion.instant, value: isOn)
        .accessibilityHidden(true)
    }
}

struct AttemptPip: View {
    var available: Bool

    var body: some View {
        ChamferedRectangle(chamfer: 2)
            .fill(available ? AnyShapeStyle(OrionColor.goldGradient) : AnyShapeStyle(OrionColor.bronze.opacity(0.35)))
            .frame(width: 14, height: 14)
            .rotationEffect(.degrees(45))
            .frame(width: 20, height: 20)
            .animation(OrionMotion.instant, value: available)
            .accessibilityHidden(true)
    }
}

struct OrionField: View {
    var title: String
    @Binding var text: String
    var secure = false

    var body: some View {
        Group {
            if secure {
                SecureField("", text: $text, prompt: Text(title).foregroundStyle(OrionColor.dust))
            } else {
                TextField("", text: $text, prompt: Text(title).foregroundStyle(OrionColor.dust))
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
        }
        .font(OrionFont.body(16))
        .foregroundStyle(OrionColor.starlight)
        .tint(OrionColor.hullGold)
        .padding(.horizontal, 12)
        .frame(minHeight: OrionLayout.minTap)
        .background(OrionColor.void, in: ChamferedRectangle(chamfer: 8))
        .overlay {
            ChamferedRectangle(chamfer: 8)
                .strokeBorder(OrionColor.hullLine, lineWidth: 1)
        }
    }
}
