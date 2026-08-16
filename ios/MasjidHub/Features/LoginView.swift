import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: Session

    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 8) {
                    Image(systemName: "moon.stars")
                        .font(.system(size: 44))
                        .foregroundColor(Brand.gold)
                    Text("MasjidHub")
                        .font(.largeTitle.weight(.semibold))
                        .foregroundColor(Brand.green)
                    Text("Staff sign in")
                        .foregroundColor(Brand.muted)
                }
                .padding(.top, 48)

                Card {
                    VStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Email").font(.caption).foregroundColor(Brand.muted)
                            TextField("you@masjid.org", text: $email)
                                .textContentType(.emailAddress)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .textFieldStyle(.roundedBorder)
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Password").font(.caption).foregroundColor(Brand.muted)
                            SecureField("••••••••", text: $password)
                                .textContentType(.password)
                                .textFieldStyle(.roundedBorder)
                                .onSubmit { submit() }
                        }
                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundColor(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Button(action: submit) {
                            HStack {
                                if busy { ProgressView().tint(.white) }
                                Text(busy ? "Signing in…" : "Sign in")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Brand.green)
                        .controlSize(.large)
                        .disabled(busy || email.isEmpty || password.isEmpty)
                    }
                }
                .frame(maxWidth: 420)

                Text("Use the account your masjid administrator created for you.")
                    .font(.footnote)
                    .foregroundColor(Brand.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 420)
            }
            .padding(20)
            .frame(maxWidth: .infinity)
        }
        .brandBackground()
    }

    private func submit() {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            do {
                try await session.signIn(
                    email: email.trimmingCharacters(in: .whitespaces),
                    password: password
                )
            } catch {
                self.error = error.localizedDescription
            }
            busy = false
        }
    }
}
