import SwiftUI

@MainActor
final class AnnouncementsModel: ObservableObject {
    @Published var state: LoadState<[Announcement]> = .idle

    func load(masjidId: String) async {
        if case .loaded = state {} else { state = .loading }
        do {
            let page = try await APIClient.shared.get(
                endpoint("/masjids/\(masjidId)/announcements", ["pageSize": "50"]),
                as: Paginated<Announcement>.self
            )
            state = .loaded(page.data)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

struct AnnouncementsView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = AnnouncementsModel()

    var body: some View {
        StateView(state: model.state, retry: { Task { await reload() } }) { items in
            if items.isEmpty {
                EmptyStateView(
                    icon: "megaphone",
                    title: "No announcements",
                    detail: "Announcements posted from the web dashboard show up here."
                )
                .brandBackground()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(items) { item in
                            Card {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(alignment: .top) {
                                        Text(item.title)
                                            .font(.headline)
                                            .foregroundColor(Brand.ink)
                                        Spacer(minLength: 8)
                                        StatusPill(status: item.status)
                                    }
                                    Text(item.body)
                                        .font(.subheadline)
                                        .foregroundColor(Brand.ink)
                                        .fixedSize(horizontal: false, vertical: true)
                                    if let published = item.publishedAt {
                                        Text(Format.instant(published, timezone: session.masjid?.timezone))
                                            .font(.caption)
                                            .foregroundColor(Brand.muted)
                                    }
                                }
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: 700)
                    .frame(maxWidth: .infinity)
                }
                .refreshable { await reload() }
            }
        }
        .brandBackground()
        .navigationTitle("Announcements")
        .task { await reload() }
    }

    private func reload() async {
        guard let masjidId = session.masjidId else {
            model.state = .failed("Your account is not linked to a masjid.")
            return
        }
        await model.load(masjidId: masjidId)
    }
}
