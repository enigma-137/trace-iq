// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "TraceIQ",
    platforms: [.iOS(.v13), .macOS(.v10_15), .tvOS(.v13), .watchOS(.v6)],
    products: [
        .library(name: "TraceIQ", targets: ["TraceIQ"])
    ],
    targets: [
        .target(name: "TraceIQ", path: "Sources/TraceIQ")
    ]
)
