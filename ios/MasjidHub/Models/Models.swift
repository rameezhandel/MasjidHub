import Foundation

// Mirrors of the API's JSON. Dates that the API sends as plain YYYY-MM-DD
// strings (prayer dates, fee dates) stay strings here: they are calendar days
// in the masjid's timezone, not instants, and turning them into `Date` only
// invites off-by-one bugs.

struct Paginated<T: Decodable>: Decodable {
    let data: [T]
    let meta: Meta

    struct Meta: Decodable {
        let page: Int
        let pageSize: Int
        let total: Int
        let totalPages: Int
    }
}

struct AuthTokens: Decodable {
    let tokenType: String
    let accessToken: String
    let expiresIn: Int
    let refreshToken: String
    let user: User
}

struct User: Decodable, Identifiable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let role: String
    let masjidId: String?
    let isActive: Bool

    var fullName: String { "\(firstName) \(lastName)" }
    var isAdmin: Bool { role == "MASJID_ADMIN" || role == "PLATFORM_ADMIN" }
}

struct Masjid: Decodable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let city: String?
    let timezone: String
    let currency: String
    let calculationMethod: String
}

struct PrayerTimetableEntry: Decodable, Identifiable {
    let id: String
    let date: String
    let fajr: String
    let fajrIqamah: String?
    let dhuhr: String
    let dhuhrIqamah: String?
    let asr: String
    let asrIqamah: String?
    let maghrib: String
    let maghribIqamah: String?
    let isha: String
    let ishaIqamah: String?
    let jumuah1: String?
    let jumuah2: String?

    /// The five daily prayers in order, for tables and "what's next".
    var prayers: [PrayerSlot] {
        [
            PrayerSlot(name: "Fajr", adhan: fajr, iqamah: fajrIqamah),
            PrayerSlot(name: "Dhuhr", adhan: dhuhr, iqamah: dhuhrIqamah),
            PrayerSlot(name: "Asr", adhan: asr, iqamah: asrIqamah),
            PrayerSlot(name: "Maghrib", adhan: maghrib, iqamah: maghribIqamah),
            PrayerSlot(name: "Isha", adhan: isha, iqamah: ishaIqamah),
        ]
    }
}

/// One row of a timetable. A struct rather than a tuple so `ForEach` can key on it.
struct PrayerSlot: Identifiable {
    let name: String
    let adhan: String
    let iqamah: String?

    var id: String { name }
}

struct Household: Decodable, Identifiable {
    let id: String
    let familyName: String
    let headName: String
    let phone: String?
    let email: String?
    let addressLine1: String?
    let city: String?
    let notes: String?
    let status: String
    let feeAmountCents: Int?
    let feeFrequency: String?
    let feeStartOn: String?
    let feeEndOn: String?
    let members: [HouseholdMember]?
    let _count: CountBox?

    struct CountBox: Decodable { let members: Int }

    var memberCount: Int { members?.count ?? _count?.members ?? 0 }
}

struct HouseholdMember: Decodable, Identifiable {
    let id: String
    let firstName: String
    let lastName: String
    let relationship: String?
    let gender: String?
    let dateOfBirth: String?

    var fullName: String { "\(firstName) \(lastName)" }
}

struct HouseholdSummary: Decodable {
    let total: Int
    let active: Int
    let inactive: Int
    let movedOut: Int
    let members: Int
}

// MARK: - Dues

struct DuesRow: Decodable, Identifiable {
    let id: String
    let familyName: String
    let headName: String
    let phone: String?
    let status: String
    let feeAmountCents: Int?
    let feeFrequency: String?
    let feeStartOn: String?
    let feeEndOn: String?
    let expectedCents: Int
    let paidCents: Int
    let balanceCents: Int
}

struct DuesTotals: Decodable {
    let currency: String
    let expectedCents: Int
    let paidCents: Int
    let balanceCents: Int
    let households: Int
    let owingHouseholds: Int
    let withoutFee: Int
}

/// `GET /masjids/:id/dues` — a page of households plus masjid-wide totals.
struct DuesList: Decodable {
    let data: [DuesRow]
    let meta: Paginated<DuesRow>.Meta
    let totals: DuesTotals
}

struct Payment: Decodable, Identifiable {
    let id: String
    let amountCents: Int
    let paidOn: String
    let method: String?
    let periodLabel: String?
}

struct DuesSummary: Decodable {
    let currency: String
    let feeAmountCents: Int?
    let feeFrequency: String?
    let feeStartOn: String?
    let feeEndOn: String?
    let expectedCents: Int
    let paidCents: Int
    let balanceCents: Int
    let payments: [Payment]
}

// MARK: - Content

struct Announcement: Decodable, Identifiable {
    let id: String
    let title: String
    let body: String
    let status: String
    let publishedAt: String?
}

struct MasjidEvent: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let location: String?
    let startsAt: String
    let endsAt: String?
    let status: String
}
