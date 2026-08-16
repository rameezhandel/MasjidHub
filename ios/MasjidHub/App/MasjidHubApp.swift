import SwiftUI

@main
struct MasjidHubApp: App {
    @StateObject private var session = Session()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(Brand.green)
                .task { await session.restore() }
        }
    }
}
