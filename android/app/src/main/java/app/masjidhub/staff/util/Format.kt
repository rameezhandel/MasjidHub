package app.masjidhub.staff.util

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Locale

/**
 * Calendar days (`2026-08-16`) are formatted as days, instants are formatted in
 * the masjid's timezone. Keeping the two apart is what stops a Friday from
 * showing as a Thursday for anyone whose phone sits in another zone.
 */
object Format {

    private val indiaLocale: Locale = Locale.forLanguageTag("en-IN")
    private val dayDisplay: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM yyyy", indiaLocale)
    private val weekdayDisplay: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEE d MMM", indiaLocale)
    private val instantDisplay: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM, h:mm a", indiaLocale)
    private val timeDisplay: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm a", indiaLocale)

    /** Cents to "₹1,250.00". Falls back to a plain number for unknown codes. */
    fun money(cents: Int?, currency: String): String {
        if (cents == null) return "—"
        val amount = cents / 100.0
        val formatter = java.text.NumberFormat.getCurrencyInstance(indiaLocale)
        return try {
            formatter.currency = Currency.getInstance(currency)
            formatter.format(amount)
        } catch (_: Exception) {
            String.format(indiaLocale, "%.2f", amount)
        }
    }

    /** "2026-08-16" → "16 Aug 2026". */
    fun day(isoDay: String?): String = parseDay(isoDay)?.format(dayDisplay) ?: (isoDay ?: "—")

    /** "2026-08-16" → "Sun 16 Aug". */
    fun weekday(isoDay: String?): String =
        parseDay(isoDay)?.format(weekdayDisplay) ?: (isoDay ?: "—")

    /** An ISO instant rendered in the masjid's timezone: "16 Aug, 7:30 pm". */
    fun instant(iso: String?, timezone: String?): String {
        val moment = parseInstant(iso) ?: return "—"
        return moment.atZone(zone(timezone)).format(instantDisplay)
    }

    /** "Sat 16 Aug, 7:30 pm – 9:00 pm" when both ends fall on the same day. */
    fun range(startIso: String, endIso: String?, timezone: String?): String {
        val start = parseInstant(startIso) ?: return "—"
        val zone = zone(timezone)
        val startLocal: ZonedDateTime = start.atZone(zone)
        val end = parseInstant(endIso) ?: return startLocal.format(instantDisplay)
        val endLocal = end.atZone(zone)
        return if (startLocal.toLocalDate() == endLocal.toLocalDate()) {
            "${startLocal.format(instantDisplay)} – ${endLocal.format(timeDisplay)}"
        } else {
            "${startLocal.format(instantDisplay)} – ${endLocal.format(instantDisplay)}"
        }
    }

    /** "MOVED_OUT" → "Moved out". */
    fun label(raw: String?): String {
        if (raw.isNullOrBlank()) return "—"
        return raw.split('_')
            .joinToString(" ") { it.lowercase(indiaLocale) }
            .replaceFirstChar { it.uppercase(indiaLocale) }
    }

    /** Today in the masjid's timezone, as the API's YYYY-MM-DD. */
    fun today(timezone: String?, offsetDays: Long = 0): String =
        LocalDate.now(zone(timezone)).plusDays(offsetDays).toString()

    fun zone(identifier: String?): ZoneId = try {
        if (identifier.isNullOrBlank()) ZoneId.systemDefault() else ZoneId.of(identifier)
    } catch (_: Exception) {
        ZoneId.systemDefault()
    }

    private fun parseDay(isoDay: String?): LocalDate? =
        if (isoDay.isNullOrBlank()) null else try {
            LocalDate.parse(isoDay)
        } catch (_: Exception) {
            null
        }

    private fun parseInstant(iso: String?): Instant? =
        if (iso.isNullOrBlank()) null else try {
            Instant.parse(iso)
        } catch (_: Exception) {
            try {
                ZonedDateTime.parse(iso).toInstant()
            } catch (_: Exception) {
                null
            }
        }
}
