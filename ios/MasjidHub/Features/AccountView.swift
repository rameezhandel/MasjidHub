import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var session: Session

    @State private var editingProfile = false
    @State private var changingPassword = false
    @State private var confirmingSignOut = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                profileCard
                masjidCard
                securityCard
                signOutButton
            }
            .padding(16)
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .brandBackground()
        .navigationTitle("Account")
        .sheet(isPresented: $editingProfile) {
            EditProfileView()
        }
        .sheet(isPresented: $changingPassword) {
            ChangePasswordView()
        }
        .confirmationDialog("Sign out of MasjidHub?", isPresented: $confirmingSignOut) {
            Button("Sign out", role: .destructive) {
                Task { await session.signOut() }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    private var profileCard: some View {
        Card(title: "Profile") {
            VStack(spacing: 10) {
                DetailRow(label: "Name", value: session.user?.fullName ?? "—")
                DetailRow(label: "Email", value: session.user?.email ?? "—")
                DetailRow(label: "Role", value: Format.label(session.user?.role ?? "—"))
                Button {
                    editingProfile = true
                } label: {
                    Label("Edit profile", systemImage: "pencil")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(Brand.green)
            }
        }
    }

    @ViewBuilder
    private var masjidCard: some View {
        if let masjid = session.masjid {
            Card(title: "Masjid") {
                VStack(spacing: 10) {
                    DetailRow(label: "Name", value: masjid.name)
                    DetailRow(label: "City", value: masjid.city ?? "—")
                    DetailRow(label: "Timezone", value: masjid.timezone)
                    DetailRow(label: "Currency", value: masjid.currency)
                    DetailRow(label: "Public page", value: "/m/\(masjid.slug)")
                }
            }
        }
    }

    private var securityCard: some View {
        Card(title: "Security") {
            Button {
                changingPassword = true
            } label: {
                Label("Change password", systemImage: "lock")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(Brand.green)
        }
    }

    private var signOutButton: some View {
        Button(role: .destructive) {
            confirmingSignOut = true
        } label: {
            Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
    }
}

// MARK: - Edit profile

struct EditProfileView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var firstName = ""
    @State private var lastName = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Your name") {
                    TextField("First name", text: $firstName)
                    TextField("Last name", text: $lastName)
                }
                if let error {
                    Section { Text(error).foregroundColor(.red) }
                }
            }
            .navigationTitle("Edit profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save)
                        .disabled(saving || firstName.isEmpty || lastName.isEmpty)
                }
            }
            .onAppear {
                firstName = session.user?.firstName ?? ""
                lastName = session.user?.lastName ?? ""
            }
        }
    }

    private func save() {
        saving = true
        error = nil
        struct Body: Encodable {
            let firstName: String
            let lastName: String
        }
        Task {
            do {
                _ = try await APIClient.shared.patch(
                    "/auth/me",
                    body: Body(firstName: firstName, lastName: lastName),
                    as: User.self
                )
                await session.refreshProfile()
                dismiss()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}

// MARK: - Change password

struct ChangePasswordView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss

    @State private var current = ""
    @State private var new = ""
    @State private var confirm = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Current password") {
                    SecureField("Current password", text: $current)
                }
                Section {
                    SecureField("New password", text: $new)
                    SecureField("Repeat new password", text: $confirm)
                } header: {
                    Text("New password")
                } footer: {
                    Text("At least 12 characters. Changing it signs you out everywhere.")
                }
                if let error {
                    Section { Text(error).foregroundColor(.red) }
                }
            }
            .navigationTitle("Change password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save", action: save)
                        .disabled(saving || !isValid)
                }
            }
        }
    }

    private var isValid: Bool {
        !current.isEmpty && new.count >= 12 && new == confirm
    }

    private func save() {
        guard isValid else { return }
        saving = true
        error = nil
        struct Body: Encodable {
            let currentPassword: String
            let newPassword: String
        }
        Task {
            do {
                _ = try await APIClient.shared.post(
                    "/auth/change-password",
                    body: Body(currentPassword: current, newPassword: new),
                    as: NoContent.self
                )
                // The API revokes every session, so this device has to sign in again.
                dismiss()
                await session.signOut()
            } catch {
                self.error = error.localizedDescription
            }
            saving = false
        }
    }
}
