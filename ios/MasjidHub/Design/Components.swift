import SwiftUI

/// Every screen loads the same way: nothing, spinner, content, or an error with
/// a retry. Modelling it once keeps the screens short.
enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(String)

    var value: Value? {
        if case let .loaded(value) = self { return value }
        return nil
    }
}

/// Renders a `LoadState`. Marked `@MainActor` like every other view here, so
/// the retry closure keeps its isolation when a screen hands one over.
@MainActor
struct StateView<Value, Content: View>: View {
    private let state: LoadState<Value>
    private let retry: () -> Void
    private let content: (Value) -> Content

    init(
        state: LoadState<Value>,
        retry: @escaping () -> Void,
        @ViewBuilder content: @escaping (Value) -> Content
    ) {
        self.state = state
        self.retry = retry
        self.content = content
    }

    var body: some View {
        switch state {
        case .idle, .loading:
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .tint(Brand.gold)
        case let .loaded(value):
            content(value)
        case let .failed(message):
            ErrorView(message: message, retry: retry)
        }
    }
}

@MainActor
struct ErrorView: View {
    private let message: String
    private let retry: () -> Void

    init(message: String, retry: @escaping () -> Void) {
        self.message = message
        self.retry = retry
    }

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(Brand.gold)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundColor(Brand.muted)
            Button("Try again") { retry() }
                .buttonStyle(.borderedProminent)
                .tint(Brand.green)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct EmptyStateView: View {
    private let icon: String
    private let title: String
    private let detail: String?

    init(icon: String, title: String, detail: String? = nil) {
        self.icon = icon
        self.title = title
        self.detail = detail
    }

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundColor(Brand.muted)
            Text(title).font(.headline)
            if let detail {
                Text(detail)
                    .font(.subheadline)
                    .foregroundColor(Brand.muted)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }
}

/// A titled card, the app's one container shape.
struct Card<Content: View>: View {
    private let title: String?
    private let accessory: String?
    private let content: Content

    init(
        title: String? = nil,
        accessory: String? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.accessory = accessory
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if title != nil || accessory != nil {
                HStack {
                    if let title {
                        Text(title)
                            .font(.headline)
                            .foregroundColor(Brand.ink)
                    }
                    Spacer(minLength: 8)
                    if let accessory {
                        Text(accessory)
                            .font(.caption)
                            .foregroundColor(Brand.muted)
                    }
                }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Brand.card)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Brand.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

/// One number with a caption — the overview and dues headers are grids of these.
struct StatTile: View {
    private let label: String
    private let value: String
    private let emphasis: Bool

    init(label: String, value: String, emphasis: Bool = false) {
        self.label = label
        self.value = value
        self.emphasis = emphasis
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(Brand.muted)
            Text(value)
                .font(.title3.weight(.semibold))
                .foregroundColor(emphasis ? Brand.gold : Brand.ink)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Household and content statuses, coloured the way the web app colours them.
struct StatusPill: View {
    let status: String

    var body: some View {
        Text(Format.label(status))
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.15))
            .foregroundColor(tint)
            .clipShape(Capsule())
    }

    private var tint: Color {
        switch status {
        case "ACTIVE", "PUBLISHED": return Brand.green
        case "MOVED_OUT", "CANCELLED", "ARCHIVED": return Brand.muted
        default: return Brand.gold
        }
    }
}

/// A label/value row, used all over the detail screens.
struct DetailRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.subheadline)
                .foregroundColor(Brand.muted)
            Spacer(minLength: 12)
            Text(value)
                .font(.subheadline)
                .foregroundColor(Brand.ink)
                .multilineTextAlignment(.trailing)
        }
    }
}

extension View {
    /// The app's page background, applied behind scrolling content.
    func brandBackground() -> some View {
        background(Brand.ground.ignoresSafeArea())
    }
}
