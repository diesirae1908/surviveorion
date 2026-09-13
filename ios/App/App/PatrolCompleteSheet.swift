import SwiftUI

/// Chamfered PATROL COMPLETE overlay. Same copy as the website modal.
struct PatrolCompleteSheet: View {
    var onDismiss: () -> Void
    var onGoldPatrol: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.72)
                .ignoresSafeArea()
            VStack(spacing: 16) {
                Text("PATROL COMPLETE")
                    .font(OrionFont.display(32))
                    .foregroundStyle(OrionColor.goldGradient)
                    .multilineTextAlignment(.center)
                VStack(spacing: 10) {
                    Text("Zero attempts remain. See you tomorrow, pilot.")
                        .font(OrionFont.body(16))
                        .foregroundStyle(OrionColor.starlight)
                    Text("Gold Patrol: unlimited Daily runs, plus every past patrol.")
                        .font(OrionFont.body(16))
                        .foregroundStyle(OrionColor.bronze)
                }
                .multilineTextAlignment(.center)
                Button("See You Tomorrow", action: onDismiss)
                    .buttonStyle(OrionButtonStyle(kind: .primary))
                Button("Gold Patrol", action: onGoldPatrol)
                    .buttonStyle(OrionButtonStyle(kind: .secondary))
            }
            .padding(24)
            .frame(maxWidth: 400)
            .background(OrionColor.void.opacity(0.96), in: ChamferedRectangle(chamfer: 12))
            .overlay {
                ChamferedRectangle(chamfer: 12)
                    .strokeBorder(OrionColor.hullGold.opacity(0.45), lineWidth: 1.5)
            }
            .padding(.horizontal, 24)
        }
        .accessibilityAddTraits(.isModal)
    }
}
