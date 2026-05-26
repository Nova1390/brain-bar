import SwiftUI

struct DashboardView: View {
    let model: AppModel

    var body: some View {
        GraphShellView(model: model, mode: .popover)
    }
}

#Preview {
    DashboardView(model: AppModel())
        .frame(width: 860, height: 620)
}
