@main
struct URLNormalizationSmoke {
    static func expect(_ rawValue: String, _ expected: String?, line: UInt = #line) {
        let actual = mediEvalNormalizedBaseURLString(from: rawValue)
        guard actual == expected else {
            fatalError("line \(line): \(rawValue) normalized to \(actual ?? "nil"), expected \(expected ?? "nil")")
        }
    }

    static func main() {
        expect("localhost:5199", "http://localhost:5199")
        expect("127.0.0.1:5199", "http://127.0.0.1:5199")
        expect("[::1]:5199", "http://[::1]:5199")
        expect("192.168.1.42:5182", "http://192.168.1.42:5182")
        expect("10.0.0.5:8080", "http://10.0.0.5:8080")
        expect("172.16.0.5:8080", "http://172.16.0.5:8080")
        expect("medieval.example.com", "https://medieval.example.com")
        expect("https://medieval.example.com/", "https://medieval.example.com")
        expect("https://medieval.example.com/dashboard?tab=settings#guild", "https://medieval.example.com")
        expect("https://medieval.example.com/api/mobile/eval/cards?reviewer=Davide", "https://medieval.example.com")
        expect("192.168.1.42:5182/dashboard", "http://192.168.1.42:5182")
        expect("http://localhost:5199/", "http://localhost:5199")
        expect("ftp://medieval.example.com", nil)
        expect("not a url", nil)

        print("URL normalization smoke passed")
    }
}
