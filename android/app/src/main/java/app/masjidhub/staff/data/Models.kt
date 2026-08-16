package app.masjidhub.staff.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Mirrors of the API's JSON. Dates the API sends as plain YYYY-MM-DD strings
// (prayer dates, fee dates) stay strings here: they are calendar days in the
// masjid's timezone, not instants, and parsing them into a date-time only
// invites off-by-one bugs.

@Serializable
data class PageMeta(
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val totalPages: Int,
)

@Serializable
data class Page<T>(
    val data: List<T>,
    val meta: PageMeta,
)

@Serializable
data class AuthTokens(
    val tokenType: String,
    val accessToken: String,
    val expiresIn: Int,
    val refreshToken: String,
    val user: User,
)

@Serializable
data class User(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val role: String,
    val masjidId: String? = null,
    val isActive: Boolean = true,
) {
    val fullName: String get() = "$firstName $lastName"
}

@Serializable
data class Masjid(
    val id: String,
    val name: String,
    val slug: String,
    val city: String? = null,
    val timezone: String,
    val currency: String,
)

@Serializable
data class PrayerTimetableEntry(
    val id: String,
    val date: String,
    val fajr: String,
    val fajrIqamah: String? = null,
    val dhuhr: String,
    val dhuhrIqamah: String? = null,
    val asr: String,
    val asrIqamah: String? = null,
    val maghrib: String,
    val maghribIqamah: String? = null,
    val isha: String,
    val ishaIqamah: String? = null,
    val jumuah1: String? = null,
    val jumuah2: String? = null,
) {
    /** The five daily prayers in order, for tables and "what's next". */
    val prayers: List<PrayerSlot>
        get() = listOf(
            PrayerSlot("Fajr", fajr, fajrIqamah),
            PrayerSlot("Dhuhr", dhuhr, dhuhrIqamah),
            PrayerSlot("Asr", asr, asrIqamah),
            PrayerSlot("Maghrib", maghrib, maghribIqamah),
            PrayerSlot("Isha", isha, ishaIqamah),
        )
}

data class PrayerSlot(val name: String, val adhan: String, val iqamah: String?)

@Serializable
data class MemberCount(val members: Int)

@Serializable
data class Household(
    val id: String,
    val familyName: String,
    val headName: String,
    val phone: String? = null,
    val email: String? = null,
    val addressLine1: String? = null,
    val city: String? = null,
    val notes: String? = null,
    val status: String,
    val feeAmountCents: Int? = null,
    val feeFrequency: String? = null,
    val feeStartOn: String? = null,
    val feeEndOn: String? = null,
    val members: List<HouseholdMember>? = null,
    @SerialName("_count") val count: MemberCount? = null,
) {
    val memberCount: Int get() = members?.size ?: count?.members ?: 0
}

@Serializable
data class HouseholdMember(
    val id: String,
    val firstName: String,
    val lastName: String,
    val relationship: String? = null,
    val gender: String? = null,
    val dateOfBirth: String? = null,
) {
    val fullName: String get() = "$firstName $lastName"
}

@Serializable
data class HouseholdSummary(
    val total: Int,
    val active: Int,
    val inactive: Int,
    val movedOut: Int,
    val members: Int,
)

// Dues

@Serializable
data class DuesRow(
    val id: String,
    val familyName: String,
    val headName: String,
    val phone: String? = null,
    val status: String,
    val feeAmountCents: Int? = null,
    val feeFrequency: String? = null,
    val feeStartOn: String? = null,
    val feeEndOn: String? = null,
    val expectedCents: Int,
    val paidCents: Int,
    val balanceCents: Int,
)

@Serializable
data class DuesTotals(
    val currency: String,
    val expectedCents: Int,
    val paidCents: Int,
    val balanceCents: Int,
    val households: Int,
    val owingHouseholds: Int,
    val withoutFee: Int,
)

/** `GET /masjids/:id/dues` — a page of households plus masjid-wide totals. */
@Serializable
data class DuesList(
    val data: List<DuesRow>,
    val meta: PageMeta,
    val totals: DuesTotals,
)

@Serializable
data class Payment(
    val id: String,
    val amountCents: Int,
    val paidOn: String,
    val method: String? = null,
    val periodLabel: String? = null,
)

@Serializable
data class DuesSummary(
    val currency: String,
    val feeAmountCents: Int? = null,
    val feeFrequency: String? = null,
    val feeStartOn: String? = null,
    val feeEndOn: String? = null,
    val expectedCents: Int,
    val paidCents: Int,
    val balanceCents: Int,
    val payments: List<Payment> = emptyList(),
)

// Content

@Serializable
data class Announcement(
    val id: String,
    val title: String,
    val body: String,
    val status: String,
    val publishedAt: String? = null,
)

@Serializable
data class MasjidEvent(
    val id: String,
    val title: String,
    val description: String? = null,
    val location: String? = null,
    val startsAt: String,
    val endsAt: String? = null,
    val status: String,
)

// Request bodies

@Serializable
data class Credentials(val email: String, val password: String)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class CreatePaymentRequest(
    val amountCents: Int,
    val paidOn: String,
    val method: String? = null,
    val periodLabel: String? = null,
)

@Serializable
data class UpdateProfileRequest(val firstName: String, val lastName: String)

@Serializable
data class ChangePasswordRequest(val currentPassword: String, val newPassword: String)
