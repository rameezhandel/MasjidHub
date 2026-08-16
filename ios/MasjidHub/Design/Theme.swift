import SwiftUI
import UIKit

/// The "Rub el Hizb" palette the web app uses: forest green and gold on a warm
/// greige ground, with a darker, softer set for dark mode.
enum Brand {
    static let green = adaptive(light: 0x1B_4D_33, dark: 0x57_A8_77)
    static let gold = adaptive(light: 0xB9_8A_2E, dark: 0xD9_AE_52)
    static let ground = adaptive(light: 0xF6_F3_EC, dark: 0x10_14_10)
    static let card = adaptive(light: 0xFF_FF_FF, dark: 0x18_1D_18)
    static let ink = adaptive(light: 0x1C_1E_1B, dark: 0xEC_EF_E9)
    static let muted = adaptive(light: 0x6B_6F_67, dark: 0x9C_A3_9A)
    static let hairline = adaptive(light: 0xE3_DE_D2, dark: 0x2A_31_2A)

    private static func adaptive(light: Int, dark: Int) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

private extension UIColor {
    convenience init(rgb: Int) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

// MARK: - Formatting

enum Format {
    /// Cents to "₹1,250.00". Falls back to a plain number if the currency code
    /// is one the system doesn't know.
    static func money(_ cents: Int?, currency: String) -> String {
        guard let cents else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = 2
        let amount = Decimal(cents) / 100
        return formatter.string(from: NSDecimalNumber(decimal: amount)) ?? "\(amount)"
    }

    /// "2026-08-16" → "16 Aug 2026". Parsed and formatted in UTC so the day
    /// never shifts under the device's timezone.
    static func day(_ isoDay: String?) -> String {
        guard let isoDay, let date = calendarDay.date(from: isoDay) else { return isoDay ?? "—" }
        return dayDisplay.string(from: date)
    }

    /// "2026-08-16" → "Sun 16 Aug".
    static func weekday(_ isoDay: String?) -> String {
        guard let isoDay, let date = calendarDay.date(from: isoDay) else { return isoDay ?? "—" }
        return weekdayDisplay.string(from: date)
    }

    /// An ISO instant rendered in the masjid's timezone, e.g. "16 Aug, 7:30 pm".
    static func instant(_ iso: String?, timezone: String?) -> String {
        guard let iso, let date = parseInstant(iso) else { return "—" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_IN")
        formatter.dateFormat = "d MMM, h:mm a"
        formatter.timeZone = zone(timezone)
        return formatter.string(from: date)
    }

    /// The masjid's timezone, falling back to the device's.
    static func zone(_ identifier: String?) -> TimeZone {
        identifier.flatMap(TimeZone.init(identifier:)) ?? .current
    }

    static func parseInstant(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: iso) { return date }
        return ISO8601DateFormatter().date(from: iso)
    }

    /// "MOVED_OUT" → "Moved out".
    static func label(_ raw: String) -> String {
        var words = raw.split(separator: "_").map { $0.lowercased() }
        guard let first = words.first, !first.isEmpty else { return raw }
        words[0] = first.prefix(1).uppercased() + String(first.dropFirst())
        return words.joined(separator: " ")
    }

    /// Today in the masjid's timezone, as the API's YYYY-MM-DD.
    static func today(timezone: String?, offsetDays: Int = 0) -> String {
        let tz = zone(timezone)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = tz
        let date = calendar.date(byAdding: .day, value: offsetDays, to: Date()) ?? Date()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = tz
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static let calendarDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let dayDisplay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_IN")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "d MMM yyyy"
        return formatter
    }()

    private static let weekdayDisplay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_IN")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "EEE d MMM"
        return formatter
    }()
}
