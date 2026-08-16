import SwiftUI

@MainActor
final class EventsModel: ObservableObject {
    @Published var state: LoadState<[MasjidEvent]> = .idle

    func load(masjidId: String, upcomingOnly: Bool) async {
        if case .loaded = state {} else { state = .loading }
        do {
            let page = try await APIClient.shared.get(
                endpoint(
                    "/masjids/\(masjidId)/events",
                    ["pageSize": "50", "upcoming": upcomingOnly ? "true" : nil]
                ),
                as: Paginated<MasjidEvent>.self
            )
            state = .loaded(page.data)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

struct EventsView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = EventsModel()
    @State private var upcomingOnly = true

    var body: some View {
        StateView(state: model.state, retry: { Task { await reload() } }) { events in
            if events.isEmpty {
                EmptyStateView(
                    icon: "calendar",
                    title: upcomingOnly ? "Nothing coming up" : "No events",
                    detail: "Events created from the web dashboard show up here."
                )
                .brandBackground()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(events) { event in
                            Card {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(alignment: .top) {
                                        Text(event.title)
                                            .font(.headline)
                                            .foregroundColor(Brand.ink)
                                        Spacer(minLength: 8)
                                        StatusPill(status: event.status)
                                    }
                                    Text(when(event))
                                        .font(.subheadline.weight(.medium))
                                        .foregroundColor(Brand.gold)
                                    if let location = event.location, !location.isEmpty {
                                        Label(location, systemImage: "mappin.and.ellipse")
                                            .font(.caption)
                                            .foregroundColor(Brand.muted)
                                    }
                                    if let description = event.description, !description.isEmpty {
                                        Text(description)
                                            .font(.subheadline)
                                            .foregroundColor(Brand.ink)
                                            .fixedSize(horizontal: false, vertical: true)
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
        .navigationTitle("Events")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Picker("Show", selection: $upcomingOnly) {
                    Text("Upcoming").tag(true)
                    Text("All").tag(false)
                }
                .pickerStyle(.menu)
            }
        }
        .task(id: upcomingOnly) { await reload() }
    }

    /// "Sat 16 Aug, 7:30 pm – 9:00 pm" when both ends are on the same day.
    private func when(_ event: MasjidEvent) -> String {
        let timezone = session.masjid?.timezone
        let start = Format.instant(event.startsAt, timezone: timezone)
        guard let endsAt = event.endsAt else { return start }
        let zone = Format.zone(timezone)
        guard let startDate = Format.parseInstant(event.startsAt),
              let endDate = Format.parseInstant(endsAt) else {
            return start
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        if calendar.isDate(startDate, inSameDayAs: endDate) {
            let time = DateFormatter()
            time.locale = Locale(identifier: "en_IN")
            time.timeZone = zone
            time.dateFormat = "h:mm a"
            return "\(start) – \(time.string(from: endDate))"
        }
        return "\(start) – \(Format.instant(endsAt, timezone: timezone))"
    }

    private func reload() async {
        guard let masjidId = session.masjidId else {
            model.state = .failed("Your account is not linked to a masjid.")
            return
        }
        await model.load(masjidId: masjidId, upcomingOnly: upcomingOnly)
    }
}
