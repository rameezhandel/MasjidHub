import SwiftUI

/// The sections of the app, in sidebar order.
enum AppSection: String, CaseIterable, Identifiable {
    case overview
    case prayerTimes
    case households
    case dues
    case announcements
    case events
    case account

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .prayerTimes: return "Prayer times"
        case .households: return "Households"
        case .dues: return "Dues"
        case .announcements: return "Announcements"
        case .events: return "Events"
        case .account: return "Account"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .prayerTimes: return "clock"
        case .households: return "house"
        case .dues: return "indianrupeesign.circle"
        case .announcements: return "megaphone"
        case .events: return "calendar"
        case .account: return "person.crop.circle"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var session: Session

    var body: some View {
        switch session.state {
        case .loading:
            ProgressView()
                .tint(Brand.gold)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .brandBackground()
        case .signedOut:
            LoginView()
        case .signedIn:
            HomeView()
        }
    }
}

/// One `NavigationSplitView` serves both devices: iPad gets a permanent
/// sidebar, iPhone collapses it into a push navigation stack.
struct HomeView: View {
    @EnvironmentObject private var session: Session
    @State private var selection: AppSection? = .overview

    var body: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $selection) { section in
                NavigationLink(value: section) {
                    Label(section.title, systemImage: section.icon)
                }
            }
            .navigationTitle(session.masjid?.name ?? "MasjidHub")
            .navigationBarTitleDisplayMode(.inline)
            .listStyle(.sidebar)
        } detail: {
            NavigationStack {
                detail
            }
        }
        .navigationSplitViewStyle(.balanced)
    }

    @ViewBuilder
    private var detail: some View {
        switch selection ?? .overview {
        case .overview: OverviewView()
        case .prayerTimes: PrayerTimesView()
        case .households: HouseholdsView()
        case .dues: DuesView()
        case .announcements: AnnouncementsView()
        case .events: EventsView()
        case .account: AccountView()
        }
    }
}
