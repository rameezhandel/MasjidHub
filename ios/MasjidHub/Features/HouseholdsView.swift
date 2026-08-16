import SwiftUI

@MainActor
final class HouseholdsModel: ObservableObject {
    @Published var state: LoadState<[Household]> = .idle
    @Published var search = ""
    @Published var status: String = "ALL"
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
            state = .loaded(result.data)
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
            state = .loaded(existing + result.data)
        } catch {
            // A failed "load more" shouldn't blow away the rows already shown.
        }
    }

    private func fetch(masjidId: String, page: Int) async throws -> Paginated<Household> {
        try await APIClient.shared.get(
            endpoint(
                "/masjids/\(masjidId)/households",
                [
                    "page": "\(page)",
                    "pageSize": "25",
                    "search": search.isEmpty ? nil : search,
                    "status": status == "ALL" ? nil : status,
                ]
            ),
            as: Paginated<Household>.self
        )
    }
}

struct HouseholdsView: View {
    @EnvironmentObject private var session: Session
    @StateObject private var model = HouseholdsModel()

    var body: some View {
        StateView(state: model.state, retry: { Task { await reload() } }) { households in
            List {
                if households.isEmpty {
                    EmptyStateView(
                        icon: "house",
                        title: "No households",
                        detail: model.search.isEmpty ? "Add households from the web dashboard." : "Nothing matches “\(model.search)”."
                    )
                    .listRowBackground(Color.clear)
                }
                ForEach(households) { household in
                    NavigationLink {
                        HouseholdDetailView(household: household)
                    } label: {
                        row(household)
                    }
                }
                if model.canLoadMore {
                    HStack {
                        Spacer()
                        ProgressView().tint(Brand.gold)
                        Spacer()
                    }
                    .task { await loadMore() }
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await reload() }
        }
        .brandBackground()
        .navigationTitle("Households")
        .searchable(text: $model.search, prompt: "Family, head or city")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Picker("Status", selection: $model.status) {
                        Text("All").tag("ALL")
                        Text("Active").tag("ACTIVE")
                        Text("Inactive").tag("INACTIVE")
                        Text("Moved out").tag("MOVED_OUT")
                    }
                } label: {
                    Image(systemName: "line.3.horizontal.decrease.circle")
                }
            }
        }
        .task { await reload() }
        .onChange(of: model.status) { _ in Task { await reload() } }
        .onSubmit(of: .search) { Task { await reload() } }
        .onChange(of: model.search) { value in
            if value.isEmpty { Task { await reload() } }
        }
    }

    private func row(_ household: Household) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(household.familyName)
                    .font(.body.weight(.medium))
                    .foregroundColor(Brand.ink)
                Spacer(minLength: 8)
                StatusPill(status: household.status)
            }
            Text(household.headName)
                .font(.subheadline)
                .foregroundColor(Brand.muted)
            HStack(spacing: 12) {
                Label("\(household.memberCount)", systemImage: "person.2")
                if let city = household.city, !city.isEmpty {
                    Label(city, systemImage: "mappin.and.ellipse")
                }
            }
            .font(.caption)
            .foregroundColor(Brand.muted)
        }
        .padding(.vertical, 2)
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

// MARK: - Detail

@MainActor
final class HouseholdDetailModel: ObservableObject {
    @Published var household: Household?
    @Published var dues: DuesSummary?
    @Published var error: String?
    @Published var loading = false

    func load(masjidId: String, householdId: String) async {
        loading = true
        defer { loading = false }
        do {
            async let detail = APIClient.shared.get(
                "/masjids/\(masjidId)/households/\(householdId)",
                as: Household.self
            )
            async let summary = APIClient.shared.get(
                "/masjids/\(masjidId)/households/\(householdId)/dues",
                as: DuesSummary.self
            )
            household = try await detail
            dues = try await summary
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct HouseholdDetailView: View {
    let household: Household

    @EnvironmentObject private var session: Session
    @StateObject private var model = HouseholdDetailModel()
    @State private var recordingPayment = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                detailsCard
                duesCard
                membersCard
            }
            .padding(16)
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .brandBackground()
        .navigationTitle(household.familyName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $recordingPayment) {
            RecordPaymentView(household: household) {
                Task { await load() }
            }
        }
    }

    private var current: Household { model.household ?? household }

    private var detailsCard: some View {
        Card(title: "Details") {
            VStack(spacing: 10) {
                DetailRow(label: "Head", value: current.headName)
                DetailRow(label: "Status", value: Format.label(current.status))
                DetailRow(label: "Phone", value: current.phone ?? "—")
                DetailRow(label: "Email", value: current.email ?? "—")
                DetailRow(label: "Address", value: current.addressLine1 ?? "—")
                DetailRow(label: "City", value: current.city ?? "—")
            }
        }
    }

    @ViewBuilder
    private var duesCard: some View {
        Card(title: "Dues") {
            if let dues = model.dues {
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        StatTile(
                            label: "Expected",
                            value: Format.money(dues.expectedCents, currency: dues.currency)
                        )
                        StatTile(
                            label: "Paid",
                            value: Format.money(dues.paidCents, currency: dues.currency)
                        )
                        StatTile(
                            label: "Balance",
                            value: Format.money(dues.balanceCents, currency: dues.currency),
                            emphasis: dues.balanceCents > 0
                        )
                    }
                    if let amount = dues.feeAmountCents, let frequency = dues.feeFrequency {
                        DetailRow(
                            label: "Fee",
                            value: "\(Format.money(amount, currency: dues.currency)) · \(Format.label(frequency))"
                        )
                        DetailRow(label: "Since", value: Format.day(dues.feeStartOn))
                        if let end = dues.feeEndOn {
                            DetailRow(label: "Stopped", value: Format.day(end))
                        }
                    } else {
                        Text("No fee configured for this household.")
                            .font(.subheadline)
                            .foregroundColor(Brand.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        recordingPayment = true
                    } label: {
                        Label("Record payment", systemImage: "plus.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Brand.green)

                    if !dues.payments.isEmpty {
                        Divider()
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Recent payments")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(Brand.ink)
                            ForEach(dues.payments.prefix(8)) { payment in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(Format.day(payment.paidOn))
                                            .font(.subheadline)
                                            .foregroundColor(Brand.ink)
                                        if let label = payment.periodLabel ?? payment.method, !label.isEmpty {
                                            Text(label)
                                                .font(.caption)
                                                .foregroundColor(Brand.muted)
                                        }
                                    }
                                    Spacer()
                                    Text(Format.money(payment.amountCents, currency: dues.currency))
                                        .font(.subheadline.monospacedDigit())
                                        .foregroundColor(Brand.ink)
                                }
                            }
                        }
                    }
                }
            } else if let error = model.error {
                Text(error).font(.subheadline).foregroundColor(.red)
            } else {
                ProgressView().tint(Brand.gold).frame(maxWidth: .infinity)
            }
        }
    }

    private var membersCard: some View {
        Card(title: "Members", accessory: "\(current.memberCount)") {
            if let members = model.household?.members, !members.isEmpty {
                VStack(spacing: 10) {
                    ForEach(members) { member in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.fullName).foregroundColor(Brand.ink)
                                if let relationship = member.relationship {
                                    Text(Format.label(relationship))
                                        .font(.caption)
                                        .foregroundColor(Brand.muted)
                                }
                            }
                            Spacer()
                            if let dob = member.dateOfBirth {
                                Text(Format.day(dob))
                                    .font(.caption)
                                    .foregroundColor(Brand.muted)
                            }
                        }
                    }
                }
            } else if model.loading {
                ProgressView().tint(Brand.gold).frame(maxWidth: .infinity)
            } else {
                Text("No members recorded.")
                    .font(.subheadline)
                    .foregroundColor(Brand.muted)
            }
        }
    }

    private func load() async {
        guard let masjidId = session.masjidId else { return }
        await model.load(masjidId: masjidId, householdId: household.id)
    }
}

// MARK: - Record a payment

struct RecordPaymentView: View {
    let household: Household
    let onSaved: () -> Void

    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var amount = ""
    @State private var paidOn = Date()
    @State private var method = "Cash"
    @State private var periodLabel = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Amount") {
                    TextField("0", text: $amount)
                        .keyboardType(.decimalPad)
                    DatePicker("Received on", selection: $paidOn, displayedComponents: .date)
                }
                Section("Details") {
                    TextField("Method (cash, UPI…)", text: $method)
                    TextField("Period covered (optional)", text: $periodLabel)
                }
                if let error {
                    Section {
                        Text(error).foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Record payment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save)
                        .disabled(saving || cents == nil)
                }
            }
        }
    }

    /// Rupees typed by hand, stored as cents.
    private var cents: Int? {
        guard let value = Double(amount.trimmingCharacters(in: .whitespaces)), value > 0 else {
            return nil
        }
        return Int((value * 100).rounded())
    }

    private func save() {
        guard let masjidId = session.masjidId, let cents else { return }
        saving = true
        error = nil
        struct Body: Encodable {
            let amountCents: Int
            let paidOn: String
            let method: String?
            let periodLabel: String?
        }
        let body = Body(
            amountCents: cents,
            paidOn: isoDay(paidOn),
            method: method.isEmpty ? nil : method,
            periodLabel: periodLabel.isEmpty ? nil : periodLabel
        )
        Task {
            do {
                _ = try await APIClient.shared.post(
                    "/masjids/\(masjidId)/households/\(household.id)/payments",
                    body: body,
                    as: Payment.self
                )
                onSaved()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }

    private func isoDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Format.zone(session.masjid?.timezone)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}
