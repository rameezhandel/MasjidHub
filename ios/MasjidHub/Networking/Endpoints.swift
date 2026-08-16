import Foundation

/// Builds `/path?a=1&b=two%20words`. Nil values are dropped, so callers can
/// pass optional filters straight through.
func endpoint(_ path: String, _ query: [String: String?] = [:]) -> String {
    let items = query
        .compactMapValues { $0 }
        .filter { !$0.value.isEmpty }
        .sorted { $0.key < $1.key }
        .map { key, value in
            "\(escape(key))=\(escape(value))"
        }
    return items.isEmpty ? path : path + "?" + items.joined(separator: "&")
}

private func escape(_ value: String) -> String {
    var allowed = CharacterSet.alphanumerics
    allowed.insert(charactersIn: "-._~")
    return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
}
