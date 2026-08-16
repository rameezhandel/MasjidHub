import SwiftUI

@MainActor
final class OverviewModel: ObservableObject {
    struct Snapshot {
        let today: PrayerTimetableEntry?
        let households: HouseholdSummary
        let dues: DuesTotals
        let announcements: [Announcement]
    }

    @Published var state: LoadState<Snapshot> = .idle

    func load(masjidId: String, timezone: String?) async {
        if case .loaded = state {} else { state = .loading }
        do {
            let day = Format.today(timezone: timezone)
            async let times = APIClient.shared.get(
                endpoint("/masjids/\(masjidId)/prayer-times", ["from": day, "to": day]),
                as: [PrayerTimetableEntry].self
            )
            async let households = APIClient.shared.get(
                "/masjids/\(masjidId)/households/summary",
                as: HouseholdSummary.self
            )
            async let dues = APIClient.shared.get(
                endpoint("/masjids/\(masjidId)/dues", ["pageSize": "1"]),
                as: DuesList.self
            )
            async let announcements = APIClient.shared.get(
                endpoint("/masjids/\(masjidId)/announcements", ["pageSize": "3", "status": "PUBLISHED"]),
                as: Paginated<Announcement>.self
            )
            state = .loaded(
                Snapshot(
                    today: try await times.first,
                    households: try await households,
                    dues: try await dues.totals,
                    announcements: try await announcements.data
                )
            )
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

struct OverviewView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = OverviewModel()

    var body: some View {
        StateView(state: model.state, retry: { Task { await reload() } }) { snapshot in
            ScrollView {
                VStack(spacing: 16) {
                    masjidCard
                    prayerCard(snapshot.today)
                    duesCard(snapshot.dues)
                    householdsCard(snapshot.households)
                    announcementsCard(snapshot.announcements)
                }
                .padding(16)
                .frame(maxWidth: 700)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await reload() }
        }
        .brandBackground()
        .navigationTitle("Overview")
        .task { await reload() }
    }

    private func reload() async {
        guard let masjidId = session.masjidId else {
            model.state = .failed("Your account is not linked to a masjid.")
            return
        }
        await model.load(masjidId: masjidId, timezone: session.masjid?.timezone)
    }

    private var masjidCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 4) {
                Text("Assalamu alaikum, \(session.user?.firstName ?? "")")
                    .font(.title3.weight(.semibold))
                    .foregroundColor(Brand.green)
                Text(session.masjid?.name ?? "—")
                    .foregroundColor(Brand.ink)
                if let city = session.masjid?.city, !city.isEmpty {
                    Text(city).font(.subheadline).foregroundColor(Brand.muted)
                }
            }
        }
    }

    private func prayerCard(_ entry: PrayerTimetableEntry?) -> some View {
        Card(title: "Today", accessory: Format.weekday(entry?.date)) {
            if let entry {
                VStack(spacing: 10) {
                    ForEach(entry.prayers) { prayer in
                        HStack {
                            Text(prayer.name)
                                .foregroundColor(Brand.ink)
                            Spacer()
                            Text(prayer.adhan)
                                .font(.body.monospacedDigit())
                                .foregroundColor(Brand.ink)
                            if let iqamah = prayer.iqamah, !iqamah.isEmpty {
                                Text("· \(iqamah)")
                                    .font(.body.monospacedDigit())
                                    .foregroundColor(Brand.gold)
                            }
                        }
                    }
                    if let jumuah = entry.jumuah1, !jumuah.isEmpty {
                        Divider()
                        HStack {
                            Text("Jumu'ah").foregroundColor(Brand.ink)
                            Spacer()
                            Text(jumuah)
                                .font(.body.monospacedDigit())
                                .foregroundColor(Brand.gold)
                        }
                    }
                }
            } else {
                Text("No timetable for today yet.")
                    .font(.subheadline)
                    .foregroundColor(Brand.muted)
            }
        }
    }

    private func duesCard(_ totals: DuesTotals) -> some View {
        Card(title: "Dues") {
            HStack(spacing: 12) {
                StatTile(
                    label: "Outstanding",
                    value: Format.money(totals.balanceCents, currency: totals.currency),
                    emphasis: totals.balanceCents > 0
                )
                StatTile(
                    label: "Collected",
                    value: Format.money(totals.paidCents, currency: totals.currency)
                )
                StatTile(label: "Owing", value: "\(totals.owingHouseholds)")
            }
        }
    }

    private func householdsCard(_ summary: HouseholdSummary) -> some View {
        Card(title: "Community") {
            HStack(spacing: 12) {
                StatTile(label: "Households", value: "\(summary.total)")
                StatTile(label: "Active", value: "\(summary.active)")
                StatTile(label: "Members", value: "\(summary.members)")
            }
        }
    }

    private func announcementsCard(_ items: [Announcement]) -> some View {
        Card(title: "Latest announcements") {
            if items.isEmpty {
                Text("Nothing published yet.")
                    .font(.subheadline)
                    .foregroundColor(Brand.muted)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(Brand.ink)
                            Text(Format.instant(item.publishedAt, timezone: session.masjid?.timezone))
                                .font(.caption)
                                .foregroundColor(Brand.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}
