import SwiftUI

@MainActor
final class DuesModel: ObservableObject {
    @Published var state: LoadState<DuesList> = .idle
    @Published var search = ""
    @Published var filter = "all"
    @Published private(set) var loadingMore = false

    private var page = 1
    private var totalPages = 1

    var canLoadMore: Bool { page < totalPages }

    func reload(masjidId: String) async {
        page = 1
        if case .loaded = state {} else { state = .loading }
        do {
            let result = try await fetch(masjidId: masjidId, page: 1)
            totalPages = result.meta.totalPages
            state = .loaded(result)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func loadMore(masjidId: String) async {
        guard canLoadMore, !loadingMore, let existing = state.value else { return }
        loadingMore = true
        defer { loadingMore = false }
        do {
            let result = try await fetch(masjidId: masjidId, page: page + 1)
            page += 1
            totalPages = result.meta.totalPages
            // Keep the totals from the first page: they cover the whole masjid.
            state = .loaded(
                DuesList(data: existing.data + result.data, meta: result.meta, totals: existing.totals)
            )
        } catch {
            // Leave the rows already on screen alone.
        }
    }

    private func fetch(masjidId: String, page: Int) async throws -> DuesList {
        try await APIClient.shared.get(
            endpoint(
                "/masjids/\(masjidId)/dues",
                [
                    "page": "\(page)",
                    "pageSize": "25",
                    "filter": filter,
                    "search": search.isEmpty ? nil : search,
                ]
            ),
            as: DuesList.self
        )
    }
}

struct DuesView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = DuesModel()

    var body: some View {
        StateView(state: model.state, retry: { Task { await reload() } }) { dues in
            List {
                Section {
                    totals(dues.totals)
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                        .listRowBackground(Color.clear)
                }
                Section {
                    if dues.data.isEmpty {
                        EmptyStateView(
                            icon: "indianrupeesign.circle",
                            title: "Nothing to show",
                            detail: "No household matches this filter."
                        )
                        .listRowBackground(Color.clear)
                    }
                    ForEach(dues.data) { row in
                        DuesRowView(row: row, currency: dues.totals.currency)
                    }
                    if model.canLoadMore {
                        HStack {
                            Spacer()
                            ProgressView().tint(Brand.gold)
                            Spacer()
                        }
                        .task { await loadMore() }
                    }
                } header: {
                    Text("\(dues.meta.total) households")
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await reload() }
        }
        .brandBackground()
        .navigationTitle("Dues")
        .searchable(text: $model.search, prompt: "Family or head of household")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Picker("Filter", selection: $model.filter) {
                        Text("All").tag("all")
                        Text("Owing").tag("owing")
                        Text("Settled").tag("settled")
                        Text("No fee set").tag("no-fee")
                    }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                }
            }
        }
        .task { await reload() }
        .onChange(of: model.filter) { _ in Task { await reload() } }
        .onSubmit(of: .search) { Task { await reload() } }
        .onChange(of: model.search) { value in
            if value.isEmpty { Task { await reload() } }
        }
    }

    private func totals(_ totals: DuesTotals) -> some View {
        Card(title: "Collection") {
            VStack(spacing: 14) {
                HStack(spacing: 12) {
                    StatTile(
                        label: "Expected",
                        value: Format.money(totals.expectedCents, currency: totals.currency)
                    )
                    StatTile(
                        label: "Collected",
                        value: Format.money(totals.paidCents, currency: totals.currency)
                    )
                }
                HStack(spacing: 12) {
                    StatTile(
                        label: "Outstanding",
                        value: Format.money(totals.balanceCents, currency: totals.currency),
                        emphasis: totals.balanceCents > 0
                    )
                    StatTile(label: "Households owing", value: "\(totals.owingHouseholds)")
                    StatTile(label: "No fee set", value: "\(totals.withoutFee)")
                }
            }
        }
    }

    private func reload() async {
        guard let masjidId = session.masjidId else {
            model.state = .failed("Your account is not linked to a masjid.")
            return
        }
        await model.reload(masjidId: masjidId)
    }

    private func loadMore() async {
        guard let masjidId = session.masjidId else { return }
        await model.loadMore(masjidId: masjidId)
    }
}

private struct DuesRowView: View {
    let row: DuesRow
    let currency: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(row.familyName)
                    .font(.body.weight(.medium))
                    .foregroundColor(Brand.ink)
                Spacer(minLength: 8)
                Text(Format.money(row.balanceCents, currency: currency))
                    .font(.body.monospacedDigit().weight(.semibold))
                    .foregroundColor(row.balanceCents > 0 ? Brand.gold : Brand.green)
            }
            Text(row.headName)
                .font(.subheadline)
                .foregroundColor(Brand.muted)
            HStack(spacing: 12) {
                if let amount = row.feeAmountCents, let frequency = row.feeFrequency {
                    Text("\(Format.money(amount, currency: currency)) · \(Format.label(frequency))")
                } else {
                    Text("No fee set")
                }
                Text("Paid \(Format.money(row.paidCents, currency: currency))")
            }
            .font(.caption)
            .foregroundColor(Brand.muted)
        }
        .padding(.vertical, 2)
    }
}
