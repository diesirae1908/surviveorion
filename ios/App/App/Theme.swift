import SwiftUI

enum OrionColor {
    static let void = Color(red: 10 / 255, green: 10 / 255, blue: 18 / 255)
    static let deepSpace = Color(red: 18 / 255, green: 18 / 255, blue: 30 / 255)
    static let hullGold = Color(red: 1, green: 215 / 255, blue: 0)
    static let goldPale = Color(red: 1, green: 238 / 255, blue: 136 / 255)
    static let alarm = Color(red: 1, green: 68 / 255, blue: 85 / 255)
    static let bronze = Color(red: 170 / 255, green: 136 / 255, blue: 68 / 255)
    static let starlight = Color(red: 1, green: 247 / 255, blue: 224 / 255)
    static let dust = Color(red: 138 / 255, green: 122 / 255, blue: 85 / 255)
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

struct OrionButtonStyle: ButtonStyle {
    var fill: Color = OrionColor.hullGold
    var text: Color = OrionColor.void
    var disabled = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(OrionFont.display(18, weight: .bold))
            .foregroundStyle(disabled ? OrionColor.bronze : text)
            .frame(maxWidth: .infinity, minHeight: OrionLayout.minTap)
            .background(disabled ? OrionColor.deepSpace : fill)
            .overlay(
                Rectangle()
                    .stroke(OrionColor.hullGold.opacity(disabled ? 0.25 : 0.8), lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.82 : 1)
    }
}
