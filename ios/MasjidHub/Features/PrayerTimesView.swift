import SwiftUI

@MainActor
final class PrayerTimesModel: ObservableObject {
    @Published var state: LoadState<[PrayerTimetableEntry]> = .idle

    func load(masjidId: String, timezone: String?, days: Int) async {
        if case .loaded = state {} else { state = .loading }
        do {
            let entries = try await APIClient.shared.get(
                endpoint(
                    "/masjids/\(masjidId)/prayer-times",
                    [
                        "from": Format.today(timezone: timezone),
                        "to": Format.today(timezone: timezone, offsetDays: days - 1),
                    ]
                ),
                as: [PrayerTimetableEntry].self
            )
            state = .loaded(entries)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

struct PrayerTimesView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = PrayerTimesModel()
    @State private var days = 7

    var body: some View {
        StateView(state: model.state, retry: { Task { await reload() } }) { entries in
            if entries.isEmpty {
                EmptyStateView(
                    icon: "clock.badge.questionmark",
                    title: "No timetable",
                    detail: "Generate the timetable from the web dashboard and it will appear here."
                )
                .brandBackground()
            } else {
                ScrollView {
                    VStack(spacing: 12) {
                        ForEach(entries) { entry in
                            dayCard(entry)
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
        .navigationTitle("Prayer times")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Picker("Range", selection: $days) {
                    Text("7 days").tag(7)
                    Text("30 days").tag(30)
                }
                .pickerStyle(.menu)
            }
        }
        .task(id: days) { await reload() }
    }

    private func dayCard(_ entry: PrayerTimetableEntry) -> some View {
        Card(title: Format.weekday(entry.date), accessory: isToday(entry.date) ? "Today" : nil) {
            VStack(spacing: 8) {
                ForEach(entry.prayers) { prayer in
                    HStack {
                        Text(prayer.name).foregroundColor(Brand.ink)
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
                        if let second = entry.jumuah2, !second.isEmpty {
                            Text("· \(second)")
                                .font(.body.monospacedDigit())
                                .foregroundColor(Brand.gold)
                        }
                    }
                }
            }
        }
    }

    private func isToday(_ date: String) -> Bool {
        date == Format.today(timezone: session.masjid?.timezone)
    }

    private func reload() async {
        guard let masjidId = session.masjidId else {
            model.state = .failed("Your account is not linked to a masjid.")
            return
        }
        await model.load(masjidId: masjidId, timezone: session.masjid?.timezone, days: days)
    }
}
